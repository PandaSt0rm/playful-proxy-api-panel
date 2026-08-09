package management

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	log "github.com/sirupsen/logrus"
)

// DownloadAuthFilesArchive streams all JSON auth files as a zip archive.
func (h *Handler) DownloadAuthFilesArchive(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "handler not initialized"})
		return
	}
	files, err := h.listAuthFileArchiveEntries()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	fileName := fmt.Sprintf("aiproxy-auth-files-%s.zip", time.Now().UTC().Format("20060102T150405Z"))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))
	c.Header("Content-Type", "application/zip")

	writer := zip.NewWriter(c.Writer)
	defer writer.Close()

	for _, file := range files {
		if err := writeAuthFileToZip(writer, file.name, file.path); err != nil {
			log.WithError(err).Warnf("failed to add auth file %s to archive", file.name)
		}
	}
}

// CleanupDisabledAuthFiles removes auth JSON files that are disabled in the auth manager.
func (h *Handler) CleanupDisabledAuthFiles(c *gin.Context) {
	if h == nil || h.authManager == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "core auth manager unavailable"})
		return
	}
	ctx := c.Request.Context()
	names := h.disabledAuthFileNames()
	if len(names) == 0 {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "deleted": 0, "files": []string{}, "failed": []gin.H{}})
		return
	}

	deletedFiles := make([]string, 0, len(names))
	failed := make([]gin.H, 0)
	for _, name := range names {
		deletedName, _, errDelete := h.deleteAuthFileByName(ctx, name)
		if errDelete != nil {
			failed = append(failed, gin.H{"name": name, "error": errDelete.Error()})
			continue
		}
		deletedFiles = append(deletedFiles, deletedName)
	}
	status := "ok"
	if len(failed) > 0 {
		status = "partial"
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  status,
		"deleted": len(deletedFiles),
		"files":   deletedFiles,
		"failed":  failed,
	})
}

type authFileArchiveEntry struct {
	name string
	path string
}

func (h *Handler) listAuthFileArchiveEntries() ([]authFileArchiveEntry, error) {
	if h == nil || h.cfg == nil {
		return nil, fmt.Errorf("handler not initialized")
	}
	entries, err := os.ReadDir(h.cfg.AuthDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read auth dir: %w", err)
	}
	files := make([]authFileArchiveEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if isUnsafeAuthFileName(name) || !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		path := filepath.Join(h.cfg.AuthDir, name)
		if !filepath.IsAbs(path) {
			if abs, errAbs := filepath.Abs(path); errAbs == nil {
				path = abs
			}
		}
		files = append(files, authFileArchiveEntry{name: name, path: path})
	}
	sort.Slice(files, func(i, j int) bool { return strings.ToLower(files[i].name) < strings.ToLower(files[j].name) })
	return files, nil
}

func writeAuthFileToZip(writer *zip.Writer, name, path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.Base(name)
	header.Method = zip.Deflate
	target, err := writer.CreateHeader(header)
	if err != nil {
		return err
	}
	source, err := os.Open(path)
	if err != nil {
		return err
	}
	defer source.Close()
	_, err = io.Copy(target, source)
	return err
}

func (h *Handler) disabledAuthFileNames() []string {
	if h == nil || h.authManager == nil {
		return nil
	}
	auths := h.authManager.List()
	seen := make(map[string]struct{}, len(auths))
	names := make([]string, 0)
	for _, auth := range auths {
		if auth == nil || isRuntimeOnlyAuth(auth) {
			continue
		}
		if !auth.Disabled && auth.Status != coreauth.StatusDisabled {
			continue
		}
		name := strings.TrimSpace(auth.FileName)
		if name == "" {
			if path := strings.TrimSpace(authAttribute(auth, "path")); path != "" {
				name = filepath.Base(path)
			} else {
				name = strings.TrimSpace(auth.ID)
			}
		}
		if isUnsafeAuthFileName(name) || !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
