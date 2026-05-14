package management

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/redisqueue"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/usage"
	coreusage "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/usage"
)

func TestGetUsageQueuePopsRequestedRecords(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withManagementUsageQueue(t, func() {
		redisqueue.Enqueue([]byte(`{"id":1}`))
		redisqueue.Enqueue([]byte(`{"id":2}`))
		redisqueue.Enqueue([]byte(`{"id":3}`))

		rec := httptest.NewRecorder()
		ginCtx, _ := gin.CreateTestContext(rec)
		ginCtx.Request = httptest.NewRequest(http.MethodGet, "/v0/management/usage-queue?count=2", nil)

		h := &Handler{}
		h.GetUsageQueue(ginCtx)

		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d body=%s", rec.Code, http.StatusOK, rec.Body.String())
		}

		var payload []json.RawMessage
		if errUnmarshal := json.Unmarshal(rec.Body.Bytes(), &payload); errUnmarshal != nil {
			t.Fatalf("unmarshal response: %v", errUnmarshal)
		}
		if len(payload) != 2 {
			t.Fatalf("response records = %d, want 2", len(payload))
		}
		requireRecordID(t, payload[0], 1)
		requireRecordID(t, payload[1], 2)

		remaining := redisqueue.PopOldest(10)
		if len(remaining) != 1 || string(remaining[0]) != `{"id":3}` {
			t.Fatalf("remaining queue = %q, want third item only", remaining)
		}
	})
}

func TestGetUsageQueueInvalidCountDoesNotPop(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withManagementUsageQueue(t, func() {
		redisqueue.Enqueue([]byte(`{"id":1}`))

		rec := httptest.NewRecorder()
		ginCtx, _ := gin.CreateTestContext(rec)
		ginCtx.Request = httptest.NewRequest(http.MethodGet, "/v0/management/usage-queue?count=0", nil)

		h := &Handler{}
		h.GetUsageQueue(ginCtx)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want %d body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
		}

		remaining := redisqueue.PopOldest(10)
		if len(remaining) != 1 || string(remaining[0]) != `{"id":1}` {
			t.Fatalf("remaining queue = %q, want original item", remaining)
		}
	})
}

func TestGetUsageEventsUsesSQLiteEventStore(t *testing.T) {
	gin.SetMode(gin.TestMode)
	prevEnabled := usage.StatisticsEnabled()
	usage.SetStatisticsEnabled(true)
	stop := usage.StartEventStore(context.Background(), filepath.Join(t.TempDir(), "usage.sqlite"), 0)
	t.Cleanup(func() {
		stop()
		usage.SetStatisticsEnabled(prevEnabled)
	})
	store := usage.GetEventStore()
	if store == nil {
		t.Fatal("event store was not started")
	}
	if err := store.Record(context.Background(), coreusage.Record{
		Provider:    "codex",
		Model:       "gpt-5.4-codex",
		APIKey:      "raw-secret",
		AuthType:    "oauth",
		AuthIndex:   "0",
		RequestedAt: time.Date(2026, 5, 14, 12, 0, 0, 0, time.UTC),
		Detail:      coreusage.Detail{InputTokens: 4, OutputTokens: 6, TotalTokens: 10},
	}); err != nil {
		t.Fatalf("Record() error = %v", err)
	}

	rec := httptest.NewRecorder()
	ginCtx, _ := gin.CreateTestContext(rec)
	ginCtx.Request = httptest.NewRequest(http.MethodGet, "/v0/management/usage/events?limit=10", nil)

	h := &Handler{}
	h.GetUsageEvents(ginCtx)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var payload struct {
		Events []struct {
			Provider   string `json:"provider"`
			Model      string `json:"model"`
			APIKeyHash string `json:"api_key_hash"`
		} `json:"events"`
	}
	if errUnmarshal := json.Unmarshal(rec.Body.Bytes(), &payload); errUnmarshal != nil {
		t.Fatalf("unmarshal response: %v", errUnmarshal)
	}
	if len(payload.Events) != 1 {
		t.Fatalf("events len = %d, want 1", len(payload.Events))
	}
	if payload.Events[0].Provider != "codex" || payload.Events[0].Model != "gpt-5.4-codex" {
		t.Fatalf("event = %+v", payload.Events[0])
	}
	if payload.Events[0].APIKeyHash == "" || payload.Events[0].APIKeyHash == "raw-secret" {
		t.Fatalf("api key hash = %q, want hashed value", payload.Events[0].APIKeyHash)
	}
}

func TestImportSnapshotIntoEventStoreHashesLegacyAPIName(t *testing.T) {
	store, err := usage.OpenEventStore(context.Background(), filepath.Join(t.TempDir(), "usage.sqlite"), 0)
	if err != nil {
		t.Fatalf("OpenEventStore() error = %v", err)
	}
	t.Cleanup(func() {
		if errClose := store.Close(); errClose != nil {
			t.Fatalf("Close() error = %v", errClose)
		}
	})

	_, err = importSnapshotIntoEventStore(context.Background(), store, usage.StatisticsSnapshot{
		APIs: map[string]usage.APISnapshot{
			"sk-legacy-raw": {
				Models: map[string]usage.ModelSnapshot{
					"gpt-5.4": {
						Details: []usage.RequestDetail{{
							Timestamp: time.Date(2026, 5, 14, 13, 0, 0, 0, time.UTC),
							Tokens:    usage.TokenStats{InputTokens: 1, TotalTokens: 1},
						}},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("importSnapshotIntoEventStore() error = %v", err)
	}

	events, err := store.Events(context.Background(), usage.EventQuery{Limit: 10})
	if err != nil {
		t.Fatalf("Events() error = %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}
	if events[0].Endpoint == "sk-legacy-raw" || events[0].APIKeyHash == "sk-legacy-raw" || events[0].APIKeyHash == "" {
		t.Fatalf("legacy event leaked raw api name: %+v", events[0])
	}
}

func TestPruneUsageEventsAppliesRetention(t *testing.T) {
	prevEnabled := usage.StatisticsEnabled()
	usage.SetStatisticsEnabled(true)
	stop := usage.StartEventStore(context.Background(), filepath.Join(t.TempDir(), "usage.sqlite"), 1)
	t.Cleanup(func() {
		stop()
		usage.SetStatisticsEnabled(prevEnabled)
	})
	store := usage.GetEventStore()
	if store == nil {
		t.Fatal("event store was not started")
	}
	if _, errInsert := store.InsertEvents(context.Background(), []usage.UsageEvent{
		{
			Timestamp:  time.Now().Add(-48 * time.Hour),
			Provider:   "old",
			Model:      "old-model",
			Endpoint:   "POST /old",
			AuthType:   "test",
			Tokens:     usage.TokenStats{TotalTokens: 1},
			StatusCode: 200,
		},
		{
			Timestamp:  time.Now(),
			Provider:   "new",
			Model:      "new-model",
			Endpoint:   "POST /new",
			AuthType:   "test",
			Tokens:     usage.TokenStats{TotalTokens: 1},
			StatusCode: 200,
		},
	}); errInsert != nil {
		t.Fatalf("InsertEvents() error = %v", errInsert)
	}

	rec := httptest.NewRecorder()
	ginCtx, _ := gin.CreateTestContext(rec)
	ginCtx.Request = httptest.NewRequest(http.MethodPost, "/v0/management/usage/prune", nil)

	h := &Handler{}
	h.PruneUsageEvents(ginCtx)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var payload struct {
		Deleted int64 `json:"deleted"`
		Status  struct {
			EventCount int64 `json:"event_count"`
		} `json:"status"`
	}
	if errUnmarshal := json.Unmarshal(rec.Body.Bytes(), &payload); errUnmarshal != nil {
		t.Fatalf("unmarshal response: %v", errUnmarshal)
	}
	if payload.Deleted != 1 || payload.Status.EventCount != 1 {
		t.Fatalf("payload = %+v, want deleted=1 event_count=1", payload)
	}
}

func withManagementUsageQueue(t *testing.T, fn func()) {
	t.Helper()

	prevQueueEnabled := redisqueue.Enabled()
	redisqueue.SetEnabled(false)
	redisqueue.SetEnabled(true)

	defer func() {
		redisqueue.SetEnabled(false)
		redisqueue.SetEnabled(prevQueueEnabled)
	}()

	fn()
}

func requireRecordID(t *testing.T, raw json.RawMessage, want int) {
	t.Helper()

	var payload struct {
		ID int `json:"id"`
	}
	if errUnmarshal := json.Unmarshal(raw, &payload); errUnmarshal != nil {
		t.Fatalf("unmarshal record: %v", errUnmarshal)
	}
	if payload.ID != want {
		t.Fatalf("record id = %d, want %d", payload.ID, want)
	}
}
