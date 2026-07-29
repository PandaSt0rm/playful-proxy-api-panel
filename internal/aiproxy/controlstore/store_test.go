package controlstore

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStoreMigratesSecuresAndPrunesRevisions(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "state", "aiproxy-control.sqlite")
	store, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o, want 600", info.Mode().Perm())
	}
	created := time.Date(2026, 7, 23, 12, 0, 0, 0, time.UTC)
	for index := range 501 {
		id := fmt.Sprintf("%08d-0000-4000-8000-000000000000", index)
		err = store.InsertRevision(ctx, Revision{ID: id, CreatedAt: created.Add(time.Duration(index) * time.Second), ActorIP: "127.0.0.1", ManagementPath: "/config", Action: "PUT /config", BeforeSHA256: "before", AfterSHA256: "after", BeforeYAML: []byte("a: 1\n"), AfterYAML: []byte("a: 2\n")})
		if err != nil {
			t.Fatalf("InsertRevision(%d) error = %v", index, err)
		}
	}
	revisions, err := store.ListRevisions(ctx, 600)
	if err != nil {
		t.Fatal(err)
	}
	if len(revisions) != 500 {
		t.Fatalf("revision count = %d, want 500", len(revisions))
	}
	if revisions[0].ID[:8] != "00000500" {
		t.Fatalf("newest id = %s", revisions[0].ID)
	}
}

func TestEmptyCollectionsAreNonNil(t *testing.T) {
	ctx := context.Background()
	store, err := Open(ctx, filepath.Join(t.TempDir(), "aiproxy-control.sqlite"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	revisions, err := store.ListRevisions(ctx, 50)
	if err != nil {
		t.Fatalf("ListRevisions() error = %v", err)
	}
	if revisions == nil {
		t.Fatal("ListRevisions() returned nil; JSON collections must encode as arrays")
	}

	budgets, err := store.ListBudgets(ctx)
	if err != nil {
		t.Fatalf("ListBudgets() error = %v", err)
	}
	if budgets == nil {
		t.Fatal("ListBudgets() returned nil; JSON collections must encode as arrays")
	}

	diagnostics, err := store.ListDiagnostics(ctx, "", "", 50)
	if err != nil {
		t.Fatalf("ListDiagnostics() error = %v", err)
	}
	if diagnostics == nil {
		t.Fatal("ListDiagnostics() returned nil; JSON collections must encode as arrays")
	}
}
