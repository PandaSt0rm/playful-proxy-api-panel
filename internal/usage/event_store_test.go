package usage

import (
	"bytes"
	"context"
	"path/filepath"
	"testing"
	"time"

	internallogging "github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	coreusage "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/usage"
)

func TestEventStoreRecordPersistsHashedAPIKey(t *testing.T) {
	store := openTestEventStore(t)
	ctx := internallogging.WithEndpoint(context.Background(), "POST /v1/chat/completions")
	ctx = internallogging.WithResponseStatusHolder(ctx)
	internallogging.SetResponseStatus(ctx, 200)

	err := store.Record(ctx, coreusage.Record{
		Provider:         "openai",
		Model:            "gpt-5.4",
		Alias:            "gpt-5.4-high",
		APIKey:           "sk-raw-secret",
		AuthType:         "api-key",
		AuthIndex:        "2",
		Source:           "primary",
		RequestedAt:      time.Date(2026, 5, 14, 10, 0, 0, 0, time.UTC),
		Latency:          1200 * time.Millisecond,
		FirstByteLatency: 180 * time.Millisecond,
		Detail: coreusage.Detail{
			InputTokens:         11,
			OutputTokens:        17,
			CacheReadTokens:     3,
			CacheCreationTokens: 2,
			TotalTokens:         28,
		},
	})
	if err != nil {
		t.Fatalf("Record() error = %v", err)
	}

	events, err := store.Events(context.Background(), EventQuery{Limit: 10})
	if err != nil {
		t.Fatalf("Events() error = %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}
	event := events[0]
	if event.APIKeyHash == "" || event.APIKeyHash == "sk-raw-secret" {
		t.Fatalf("api key hash = %q, want hashed secret", event.APIKeyHash)
	}
	if event.Endpoint != "POST /v1/chat/completions" || event.Method != "POST" || event.Path != "/v1/chat/completions" {
		t.Fatalf("endpoint fields = %q %q %q", event.Endpoint, event.Method, event.Path)
	}
	if event.Tokens.CachedTokens != 5 {
		t.Fatalf("cached tokens = %d, want 5", event.Tokens.CachedTokens)
	}
}

func TestEventStoreSummaryGroupsByEndpoint(t *testing.T) {
	store := openTestEventStore(t)
	ctx := context.Background()

	events := []UsageEvent{
		{
			Timestamp:  time.Date(2026, 5, 14, 10, 0, 0, 0, time.UTC),
			Provider:   "openai",
			Model:      "gpt-5.4",
			Endpoint:   "POST /v1/chat/completions",
			AuthType:   "api-key",
			Tokens:     TokenStats{InputTokens: 3, OutputTokens: 7, TotalTokens: 10},
			LatencyMs:  100,
			StatusCode: 200,
		},
		{
			Timestamp:   time.Date(2026, 5, 14, 10, 1, 0, 0, time.UTC),
			Provider:    "openai",
			Model:       "gpt-5.4",
			Endpoint:    "POST /v1/chat/completions",
			AuthType:    "api-key",
			Tokens:      TokenStats{InputTokens: 4, OutputTokens: 6, TotalTokens: 10},
			Failed:      true,
			StatusCode:  500,
			FailureBody: "upstream error",
		},
	}
	if _, err := store.InsertEvents(ctx, events); err != nil {
		t.Fatalf("InsertEvents() error = %v", err)
	}

	rows, err := store.Summary(ctx, "endpoint", EventQuery{Limit: 10})
	if err != nil {
		t.Fatalf("Summary() error = %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("summary rows = %d, want 1", len(rows))
	}
	row := rows[0]
	if row.Key != "POST /v1/chat/completions" || row.Requests != 2 || row.Failures != 1 || row.Tokens != 20 {
		t.Fatalf("summary row = %+v", row)
	}
}

func TestEventStoreJSONLRoundTripDedupes(t *testing.T) {
	source := openTestEventStore(t)
	ctx := context.Background()
	event := UsageEvent{
		Timestamp:  time.Date(2026, 5, 14, 11, 0, 0, 0, time.UTC),
		Provider:   "codex",
		Model:      "gpt-5.4-codex",
		Endpoint:   "POST /backend-api/codex/responses",
		AuthType:   "oauth",
		AuthIndex:  "0",
		Source:     "codex-account",
		Tokens:     TokenStats{InputTokens: 8, OutputTokens: 13, TotalTokens: 21},
		StatusCode: 200,
	}
	if _, err := source.InsertEvents(ctx, []UsageEvent{event}); err != nil {
		t.Fatalf("source InsertEvents() error = %v", err)
	}
	var exported bytes.Buffer
	if err := source.ExportJSONL(ctx, &exported, EventQuery{Limit: 10}); err != nil {
		t.Fatalf("ExportJSONL() error = %v", err)
	}

	target := openTestEventStore(t)
	first, err := target.ImportJSONL(ctx, bytes.NewReader(exported.Bytes()))
	if err != nil {
		t.Fatalf("first ImportJSONL() error = %v", err)
	}
	second, err := target.ImportJSONL(ctx, bytes.NewReader(exported.Bytes()))
	if err != nil {
		t.Fatalf("second ImportJSONL() error = %v", err)
	}
	if first.Added != 1 || first.Skipped != 0 {
		t.Fatalf("first import = %+v, want added=1 skipped=0", first)
	}
	if second.Added != 0 || second.Skipped != 1 {
		t.Fatalf("second import = %+v, want added=0 skipped=1", second)
	}
}

func openTestEventStore(t *testing.T) *EventStore {
	t.Helper()

	store, err := OpenEventStore(context.Background(), filepath.Join(t.TempDir(), "usage.sqlite"), 0)
	if err != nil {
		t.Fatalf("OpenEventStore() error = %v", err)
	}
	t.Cleanup(func() {
		if errClose := store.Close(); errClose != nil {
			t.Fatalf("Close() error = %v", errClose)
		}
	})
	return store
}
