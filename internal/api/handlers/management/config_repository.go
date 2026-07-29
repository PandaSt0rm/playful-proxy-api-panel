package management

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/syncstate"
	log "github.com/sirupsen/logrus"
)

var ErrConfigChanged = errors.New("config changed")

type ConfigMutation struct {
	Method     string
	Path       string
	ActorIP    string
	BeforeYAML []byte
	AfterYAML  []byte
}

type ConfigMutationObserver interface {
	RecordConfigMutation(context.Context, ConfigMutation) error
}

func (h *Handler) SetConfigMutationObserver(observer ConfigMutationObserver) {
	h.mu.Lock()
	h.configMutationObserver = observer
	h.mu.Unlock()
}

func (h *Handler) Snapshot(context.Context) (*config.Config, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.cfg == nil {
		return nil, errors.New("configuration unavailable")
	}
	return h.cfg.CloneForRuntime(), nil
}

func (h *Handler) ReadYAML(context.Context) ([]byte, string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	data, err := os.ReadFile(h.configFilePath)
	if err != nil {
		return nil, "", fmt.Errorf("read config: %w", err)
	}
	return append([]byte(nil), data...), yamlSHA256(data), nil
}

func (h *Handler) CompareAndSwapYAML(_ context.Context, candidate []byte, expectedSHA256 string) (config.YAMLMutation, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	before, err := os.ReadFile(h.configFilePath)
	if err != nil {
		return config.YAMLMutation{}, fmt.Errorf("read config: %w", err)
	}
	beforeHash := yamlSHA256(before)
	if beforeHash != expectedSHA256 {
		return config.YAMLMutation{}, fmt.Errorf("%w: current sha256 %s", ErrConfigChanged, beforeHash)
	}
	parsed, err := config.ParseConfigBytes(candidate)
	if err != nil {
		return config.YAMLMutation{}, fmt.Errorf("parse config: %w", err)
	}
	if err = writeConfigAtomic(h.configFilePath, candidate); err != nil {
		return config.YAMLMutation{}, err
	}
	after, err := os.ReadFile(h.configFilePath)
	if err != nil {
		return config.YAMLMutation{}, fmt.Errorf("verify config: %w", err)
	}
	h.cfg = parsed
	return config.YAMLMutation{
		Config:       parsed.CloneForRuntime(),
		BeforeYAML:   append([]byte(nil), before...),
		AfterYAML:    append([]byte(nil), after...),
		BeforeSHA256: beforeHash,
		AfterSHA256:  yamlSHA256(after),
	}, nil
}

func (h *Handler) SyncStateSnapshot() map[string]syncstate.HostReport {
	store := h.getSyncStateStore()
	if store == nil {
		return map[string]syncstate.HostReport{}
	}
	return store.Snapshot()
}

func (h *Handler) queueConfigMutationLocked(c *gin.Context, before, after []byte) {
	if yamlSHA256(before) == yamlSHA256(after) || h.configMutationObserver == nil {
		return
	}
	observer := h.configMutationObserver
	mutation := ConfigMutation{BeforeYAML: append([]byte(nil), before...), AfterYAML: append([]byte(nil), after...)}
	ctx := context.Background()
	if c != nil && c.Request != nil {
		mutation.Method = c.Request.Method
		mutation.Path = c.FullPath()
		mutation.ActorIP = c.ClientIP()
		ctx = context.WithoutCancel(c.Request.Context())
	}
	go func() {
		if err := observer.RecordConfigMutation(ctx, mutation); err != nil {
			log.WithError(err).Warn("record configuration mutation")
		}
	}()
}

func (h *Handler) observeConfigMutation(c *gin.Context, before, after []byte) {
	if yamlSHA256(before) == yamlSHA256(after) {
		return
	}
	h.mu.Lock()
	observer := h.configMutationObserver
	h.mu.Unlock()
	if observer == nil {
		return
	}
	mutation := ConfigMutation{BeforeYAML: append([]byte(nil), before...), AfterYAML: append([]byte(nil), after...)}
	ctx := context.Background()
	if c != nil {
		mutation.Method = c.Request.Method
		mutation.Path = c.FullPath()
		mutation.ActorIP = c.ClientIP()
		ctx = context.WithoutCancel(c.Request.Context())
	}
	if err := observer.RecordConfigMutation(ctx, mutation); err != nil {
		log.WithError(err).Warn("record configuration mutation")
	}
}

func yamlSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func writeConfigAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".aiproxy-config-*")
	if err != nil {
		return fmt.Errorf("create config temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err = tmp.Chmod(0o600); err == nil {
		_, err = tmp.Write(config.NormalizeCommentIndentation(data))
	}
	if err == nil {
		err = tmp.Sync()
	}
	closeErr := tmp.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write config temp file: %w", err)
	}
	if err = os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	dirHandle, err := os.Open(dir)
	if err != nil {
		return fmt.Errorf("open config directory: %w", err)
	}
	defer dirHandle.Close()
	if err = dirHandle.Sync(); err != nil {
		return fmt.Errorf("sync config directory: %w", err)
	}
	return nil
}
