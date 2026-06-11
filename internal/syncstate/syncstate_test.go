package syncstate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func testTime(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}

func TestStore_MergeAndSnapshot(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sync-state.json")
	store := NewStore(path)

	reportedAt := testTime(t, "2026-06-11T10:00:00Z")
	err := store.Merge("devbox", "default", []ToolReport{
		{Tool: "factory-droid", Status: "synced", ConfigHash: "abc"},
		{Tool: "codex", Status: "error", Error: "permission denied"},
	}, reportedAt)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}

	snapshot := store.Snapshot()
	host, ok := snapshot["devbox"]
	if !ok {
		t.Fatalf("expected host entry, got %v", snapshot)
	}
	if host.Profile != "default" {
		t.Errorf("profile = %q, want default", host.Profile)
	}
	if !host.ReportedAt.Equal(reportedAt) {
		t.Errorf("reportedAt = %v, want %v", host.ReportedAt, reportedAt)
	}
	if got := host.Tools["factory-droid"].Status; got != "synced" {
		t.Errorf("factory-droid status = %q, want synced", got)
	}
	// Zero timestamps default to the report time.
	if !host.Tools["factory-droid"].Timestamp.Equal(reportedAt) {
		t.Errorf("timestamp not defaulted: %v", host.Tools["factory-droid"].Timestamp)
	}
	if got := host.Tools["codex"].Error; got != "permission denied" {
		t.Errorf("codex error = %q", got)
	}
}

func TestStore_MergePreservesUnreportedTools(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sync-state.json")
	store := NewStore(path)

	first := testTime(t, "2026-06-11T10:00:00Z")
	if err := store.Merge("devbox", "default", []ToolReport{
		{Tool: "factory-droid", Status: "synced"},
		{Tool: "codex", Status: "synced"},
	}, first); err != nil {
		t.Fatalf("merge 1: %v", err)
	}

	// A later single-tool sync must not erase the codex entry.
	second := testTime(t, "2026-06-11T11:00:00Z")
	if err := store.Merge("devbox", "default", []ToolReport{
		{Tool: "factory-droid", Status: "error", Error: "boom"},
	}, second); err != nil {
		t.Fatalf("merge 2: %v", err)
	}

	host := store.Snapshot()["devbox"]
	if got := host.Tools["codex"].Status; got != "synced" {
		t.Errorf("codex status lost: %q", got)
	}
	if got := host.Tools["factory-droid"].Status; got != "error" {
		t.Errorf("factory-droid status = %q, want error", got)
	}
	if !host.ReportedAt.Equal(second) {
		t.Errorf("reportedAt not updated: %v", host.ReportedAt)
	}
}

func TestStore_PersistenceRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sync-state.json")

	store := NewStore(path)
	reportedAt := testTime(t, "2026-06-11T10:00:00Z")
	if err := store.Merge("devbox", "default", []ToolReport{
		{Tool: "aider", Status: "synced", ConfigHash: "deadbeef"},
	}, reportedAt); err != nil {
		t.Fatalf("merge: %v", err)
	}

	// A fresh store over the same path must see the persisted state.
	reloaded := NewStore(path)
	host, ok := reloaded.Snapshot()["devbox"]
	if !ok {
		t.Fatal("persisted state not reloaded")
	}
	if got := host.Tools["aider"].ConfigHash; got != "deadbeef" {
		t.Errorf("config hash = %q", got)
	}

	// File must be valid JSON with restrictive permissions.
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0600 {
		t.Errorf("permissions = %o, want 0600", perm)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("persisted file is not valid JSON: %v", err)
	}
}

func TestStore_CorruptedFileStartsFresh(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sync-state.json")
	if err := os.WriteFile(path, []byte("{not json"), 0600); err != nil {
		t.Fatalf("write: %v", err)
	}

	store := NewStore(path)
	if snapshot := store.Snapshot(); len(snapshot) != 0 {
		t.Errorf("expected empty state, got %v", snapshot)
	}
}

func TestStore_MissingFileStartsFresh(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), "missing", "sync-state.json"))
	if snapshot := store.Snapshot(); len(snapshot) != 0 {
		t.Errorf("expected empty state, got %v", snapshot)
	}
}
