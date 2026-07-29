// Package syncstate persists per-host sync status reports submitted by the
// aiproxy-sync CLI through the management API. The management panel reads the
// stored state to display real per-tool sync status next to sync profiles.
//
// State is stored as a single JSON file written atomically (temp file →
// fsync → rename) so a crash never leaves a torn file behind.
package syncstate

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ValidStatuses enumerates the tool statuses a report may carry.
var ValidStatuses = map[string]bool{
	"synced":   true,
	"error":    true,
	"conflict": true,
}

// ToolReport records the sync outcome for a single tool on a single host.
type ToolReport struct {
	// Tool is the sync tool identifier (e.g. "factory-droid").
	Tool string `json:"tool"`

	// Status is one of "synced", "error", or "conflict".
	Status string `json:"status"`

	// Timestamp is when the CLI performed the sync for this tool.
	Timestamp time.Time `json:"timestamp"`

	// ConfigHash is the SHA-256 of the written config, when available.
	ConfigHash string `json:"config_hash,omitempty"`

	// Error carries the failure detail when Status is not "synced".
	Error string `json:"error,omitempty"`
}

// HostReport aggregates the latest tool reports from one host.
type HostReport struct {
	// ReportedAt is when the server received the most recent report.
	ReportedAt time.Time `json:"reported_at"`

	// Profile is the sync profile the host last applied.
	Profile string `json:"profile,omitempty"`

	// Tools maps tool ID to its latest report.
	Tools map[string]ToolReport `json:"tools"`
}

// Store holds sync state in memory and persists it to a JSON file.
type Store struct {
	mu     sync.Mutex
	path   string
	hosts  map[string]*HostReport
	loaded bool
}

// persistedState is the on-disk representation.
type persistedState struct {
	Version int                    `json:"version"`
	Hosts   map[string]*HostReport `json:"hosts"`
}

// NewStore creates a store backed by the given file path. The file is loaded
// lazily on first access; a missing or corrupted file yields empty state.
func NewStore(path string) *Store {
	return &Store{
		path:  path,
		hosts: make(map[string]*HostReport),
	}
}

// Path returns the backing file path.
func (s *Store) Path() string {
	return s.path
}

// loadLocked reads the backing file once. Corrupted or missing state starts
// fresh — sync reports are advisory and re-populate on the next sync.
func (s *Store) loadLocked() {
	if s.loaded {
		return
	}
	s.loaded = true

	data, err := os.ReadFile(s.path)
	if err != nil || len(data) == 0 {
		return
	}
	var persisted persistedState
	if err := json.Unmarshal(data, &persisted); err != nil {
		return
	}
	if persisted.Hosts != nil {
		s.hosts = persisted.Hosts
	}
}

// Merge applies a host's tool reports and persists the result. Tools not
// present in the report keep their previous entries, so a single-tool sync
// does not erase state recorded for other tools.
func (s *Store) Merge(hostname, profile string, reports []ToolReport, reportedAt time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()

	host, ok := s.hosts[hostname]
	if !ok {
		host = &HostReport{Tools: make(map[string]ToolReport)}
		s.hosts[hostname] = host
	}
	if host.Tools == nil {
		host.Tools = make(map[string]ToolReport)
	}

	host.ReportedAt = reportedAt
	if profile != "" {
		host.Profile = profile
	}
	for _, report := range reports {
		if report.Timestamp.IsZero() {
			report.Timestamp = reportedAt
		}
		host.Tools[report.Tool] = report
	}

	return s.saveLocked()
}

// Snapshot returns a deep copy of the current state for serialisation.
func (s *Store) Snapshot() map[string]HostReport {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()

	out := make(map[string]HostReport, len(s.hosts))
	for hostname, host := range s.hosts {
		tools := make(map[string]ToolReport, len(host.Tools))
		for tool, report := range host.Tools {
			tools[tool] = report
		}
		out[hostname] = HostReport{
			ReportedAt: host.ReportedAt,
			Profile:    host.Profile,
			Tools:      tools,
		}
	}
	return out
}

// saveLocked writes the state atomically with 0600 permissions.
func (s *Store) saveLocked() error {
	data, err := json.MarshalIndent(persistedState{Version: 1, Hosts: s.hosts}, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal sync state: %w", err)
	}

	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create sync state directory %s: %w", dir, err)
	}

	f, err := os.CreateTemp(dir, ".sync-state-tmp-*")
	if err != nil {
		return fmt.Errorf("create sync state temp file: %w", err)
	}
	tmpPath := f.Name()

	cleanup := true
	defer func() {
		if cleanup {
			_ = f.Close()
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("write sync state temp file: %w", err)
	}
	if err := f.Sync(); err != nil {
		return fmt.Errorf("fsync sync state temp file: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("close sync state temp file: %w", err)
	}
	cleanup = false

	if err := os.Chmod(tmpPath, 0600); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("chmod sync state temp file: %w", err)
	}
	if err := os.Rename(tmpPath, s.path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename sync state file: %w", err)
	}
	return nil
}
