package control

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/controlstore"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/port"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/aiproxy/pricing"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/usage"
)

type UsageCosts interface {
	CostAggregates(context.Context, time.Time, time.Time) ([]usage.CostAggregate, error)
	ModelPrices(context.Context) ([]usage.ModelPrice, error)
}
type ModelCatalog interface{ Count() int }

type Dependencies struct {
	Config     port.ConfigRepository
	Runtime    port.RuntimeApplier
	Mirror     port.ConfigMirror
	SyncState  port.SyncStateRepository
	Models     ModelCatalog
	Store      *controlstore.Store
	Probe      port.ProviderProbe
	Usage      UsageCosts
	StoreError error
}

type Registrar struct {
	dependencies Dependencies
}

func New(dependencies Dependencies) *Registrar { return &Registrar{dependencies: dependencies} }

func (r *Registrar) Register(group *gin.RouterGroup) {
	group.GET("/readiness", r.readiness)
	group.GET("/pricing", r.getPricing)
	group.GET("/config-revisions", r.listRevisions)
	group.GET("/config-revisions/:id", r.getRevision)
	group.POST("/config-revisions/:id/restore", r.restoreRevision)
	group.GET("/budgets", r.listBudgets)
	group.POST("/budgets", r.createBudget)
	group.PUT("/budgets/:id", r.updateBudget)
	group.DELETE("/budgets/:id", r.deleteBudget)
	group.GET("/budget-status", r.budgetStatus)
	group.GET("/sync-drift", r.syncDrift)
	group.GET("/diagnostics", r.listDiagnostics)
	group.POST("/diagnostics", r.runDiagnostic)
}

func (r *Registrar) Close() error {
	if r.dependencies.Store == nil {
		return nil
	}
	return r.dependencies.Store.Close()
}

type readinessCheck struct {
	ID         string `json:"id"`
	Required   bool   `json:"required"`
	Status     string `json:"status"`
	Summary    string `json:"summary"`
	ActionPath string `json:"action_path"`
}

func (r *Registrar) readiness(c *gin.Context) {
	cfg, err := r.dependencies.Config.Snapshot(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "readiness_unavailable"})
		return
	}
	providerCount := len(cfg.GeminiKey) + len(cfg.InteractionsKey) + len(cfg.CodexKey) + len(cfg.XAIKey) + len(cfg.ClaudeKey) + len(cfg.OpenAICompatibility) + len(cfg.VertexCompatAPIKey)
	checks := []readinessCheck{
		{ID: "management_auth", Required: true, Status: "pass", Summary: "Management authentication is active", ActionPath: "#/management-info"},
		{ID: "proxy_api_key", Required: true, Status: passFail(len(cfg.APIKeys) > 0), Summary: summary(len(cfg.APIKeys) > 0, "Proxy API key configured", "Add a proxy API key"), ActionPath: "#/config"},
		{ID: "provider_credential", Required: true, Status: passFail(providerCount > 0), Summary: summary(providerCount > 0, "Provider credential configured", "Add a provider credential"), ActionPath: "#/ai-providers"},
		{ID: "model_catalog", Required: true, Status: passFail(r.dependencies.Models != nil && r.dependencies.Models.Count() > 0), Summary: summary(r.dependencies.Models != nil && r.dependencies.Models.Count() > 0, "Model catalog available", "No effective models are registered"), ActionPath: "#/ai-providers"},
		{ID: "usage_collection", Required: false, Status: passWarn(cfg.UsageStatisticsEnabled), Summary: summary(cfg.UsageStatisticsEnabled, "Usage collection enabled", "Usage collection is disabled"), ActionPath: "#/usage"},
		{ID: "sync_profile", Required: false, Status: passWarn(len(cfg.SyncProfiles) > 0), Summary: summary(len(cfg.SyncProfiles) > 0, "Sync profile configured", "No sync profile is configured"), ActionPath: "#/tooling-templates"},
		{ID: "control_store", Required: false, Status: passWarn(r.dependencies.Store != nil), Summary: summary(r.dependencies.Store != nil, "Control store available", "Control store is unavailable"), ActionPath: "#/management-info"},
	}
	status := "ready"
	for _, check := range checks {
		if check.Required && check.Status == "fail" {
			status = "blocked"
			break
		}
		if check.Status == "warn" {
			status = "attention"
		}
	}
	c.JSON(http.StatusOK, gin.H{"status": status, "checks": checks})
}

func passFail(ok bool) string {
	if ok {
		return "pass"
	}
	return "fail"
}
func passWarn(ok bool) string {
	if ok {
		return "pass"
	}
	return "warn"
}
func summary(ok bool, success, failure string) string {
	if ok {
		return success
	}
	return failure
}

func (r *Registrar) getPricing(c *gin.Context) {
	catalog, err := pricing.Load()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "pricing_unavailable"})
		return
	}
	c.JSON(http.StatusOK, catalog)
}

func (r *Registrar) requireStore(c *gin.Context) bool {
	if r.dependencies.Store != nil {
		return true
	}
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": "control_store_unavailable"})
	return false
}

func (r *Registrar) RecordMutation(ctx context.Context, mutation Mutation) error {
	if r.dependencies.Store == nil {
		return r.dependencies.StoreError
	}
	id, err := controlstore.NewID()
	if err != nil {
		return err
	}
	return r.dependencies.Store.InsertRevision(ctx, controlstore.Revision{ID: id, CreatedAt: time.Now().UTC(), ActorIP: mutation.ActorIP, ManagementPath: mutation.Path, Action: strings.TrimSpace(mutation.Method + " " + mutation.Path), BeforeSHA256: sha(mutation.BeforeYAML), AfterSHA256: sha(mutation.AfterYAML), BeforeYAML: mutation.BeforeYAML, AfterYAML: mutation.AfterYAML})
}

type Mutation struct {
	Method, Path, ActorIP string
	BeforeYAML, AfterYAML []byte
}

func (r *Registrar) listRevisions(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	limit := boundedInt(c.Query("limit"), 50, 1, 100)
	revisions, err := r.dependencies.Store.ListRevisions(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "revision_query_failed"})
		return
	}
	_, current, _ := r.dependencies.Config.ReadYAML(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"revisions": revisions, "next_cursor": "", "current_sha256": current})
}

func (r *Registrar) getRevision(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	revision, err := r.dependencies.Store.GetRevision(c.Request.Context(), c.Param("id"))
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "revision_query_failed"})
		return
	}
	diff, err := RedactedDiff(revision.BeforeYAML, revision.AfterYAML)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "revision_diff_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": revision.ID, "created_at": revision.CreatedAt, "actor_ip": revision.ActorIP, "management_path": revision.ManagementPath, "action": revision.Action, "before_sha256": revision.BeforeSHA256, "after_sha256": revision.AfterSHA256, "diff": diff})
}

func (r *Registrar) restoreRevision(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	var request struct {
		Expected string `json:"expected_current_sha256"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	revision, err := r.dependencies.Store.GetRevision(c.Request.Context(), c.Param("id"))
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "revision_query_failed"})
		return
	}
	candidate, err := config.ParseConfigBytes(revision.AfterYAML)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid_config"})
		return
	}
	if r.dependencies.Runtime != nil {
		if err = r.dependencies.Runtime.ValidateConfig(c.Request.Context(), candidate); err != nil {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid_config"})
			return
		}
	}
	mutation, err := r.dependencies.Config.CompareAndSwapYAML(c.Request.Context(), revision.AfterYAML, request.Expected)
	if err != nil {
		_, current, _ := r.dependencies.Config.ReadYAML(c.Request.Context())
		c.JSON(http.StatusConflict, gin.H{"error": "config_changed", "current_sha256": current})
		return
	}
	if r.dependencies.Mirror != nil {
		if persisted, persistErr := r.dependencies.Mirror.PersistConfigBytes(c.Request.Context(), mutation.AfterYAML, mutation.AfterSHA256); persistErr != nil || persisted != mutation.AfterSHA256 {
			_, _ = r.dependencies.Config.CompareAndSwapYAML(c.Request.Context(), mutation.BeforeYAML, mutation.AfterSHA256)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "config_write_failed"})
			return
		}
	}
	if r.dependencies.Runtime != nil {
		if err = r.dependencies.Runtime.ApplyConfig(c.Request.Context(), mutation.Config); err != nil {
			_, rollbackErr := r.dependencies.Config.CompareAndSwapYAML(c.Request.Context(), mutation.BeforeYAML, mutation.AfterSHA256)
			rolledBack := rollbackErr == nil
			c.JSON(http.StatusInternalServerError, gin.H{"error": "config_apply_failed", "rolled_back": rolledBack})
			return
		}
	}
	if err = r.RecordMutation(c.Request.Context(), Mutation{Method: "POST", Path: c.FullPath(), ActorIP: c.ClientIP(), BeforeYAML: mutation.BeforeYAML, AfterYAML: mutation.AfterYAML}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "revision_record_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "restored", "current_sha256": mutation.AfterSHA256})
}

func (r *Registrar) listBudgets(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	budgets, err := r.dependencies.Store.ListBudgets(c.Request.Context())
	if err != nil {
		c.JSON(500, gin.H{"error": "budget_query_failed"})
		return
	}
	c.JSON(200, gin.H{"budgets": budgetDTOs(budgets)})
}

type budgetRequest struct {
	Name    string      `json:"name"`
	Scope   string      `json:"scope"`
	Match   string      `json:"match"`
	Period  string      `json:"period"`
	Limit   json.Number `json:"limit_usd"`
	Warning int         `json:"warning_percent"`
	Enabled bool        `json:"enabled"`
}

func (r *Registrar) createBudget(c *gin.Context) { r.writeBudget(c, "") }
func (r *Registrar) updateBudget(c *gin.Context) { r.writeBudget(c, c.Param("id")) }
func (r *Registrar) writeBudget(c *gin.Context, id string) {
	if !r.requireStore(c) {
		return
	}
	decoder := json.NewDecoder(c.Request.Body)
	decoder.UseNumber()
	var request budgetRequest
	if err := decoder.Decode(&request); err != nil {
		c.JSON(400, gin.H{"error": "invalid_budget"})
		return
	}
	limit, err := pricing.ParseMicro(request.Limit.String())
	if err != nil || limit <= 0 || request.Warning < 1 || request.Warning > 100 || !validBudgetScope(request.Scope, request.Match) || !contains([]string{"day", "week", "month"}, request.Period) {
		c.JSON(422, gin.H{"error": "invalid_budget"})
		return
	}
	now := time.Now().UTC()
	if id == "" {
		id, _ = controlstore.NewID()
	}
	budget := controlstore.Budget{ID: id, Name: strings.TrimSpace(request.Name), Scope: request.Scope, MatchValue: strings.TrimSpace(request.Match), Period: request.Period, LimitMicroUSD: limit, WarningPercent: request.Warning, Enabled: request.Enabled, CreatedAt: now, UpdatedAt: now}
	if c.Request.Method == http.MethodPost {
		err = r.dependencies.Store.CreateBudget(c.Request.Context(), budget)
	} else {
		var found bool
		found, err = r.dependencies.Store.UpdateBudget(c.Request.Context(), budget)
		if err == nil && !found {
			c.JSON(404, gin.H{"error": "not_found"})
			return
		}
	}
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			c.JSON(409, gin.H{"error": "budget_conflict"})
		} else {
			c.JSON(500, gin.H{"error": "budget_write_failed"})
		}
		return
	}
	c.JSON(map[bool]int{true: 201, false: 200}[c.Request.Method == http.MethodPost], budgetDTO(budget))
}

func (r *Registrar) deleteBudget(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	found, err := r.dependencies.Store.DeleteBudget(c.Request.Context(), c.Param("id"))
	if err != nil {
		c.JSON(500, gin.H{"error": "budget_write_failed"})
		return
	}
	if !found {
		c.JSON(404, gin.H{"error": "not_found"})
		return
	}
	c.Status(204)
}
func (r *Registrar) budgetStatus(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	budgets, err := r.dependencies.Store.ListBudgets(c.Request.Context())
	if err != nil {
		c.JSON(500, gin.H{"error": "budget_query_failed"})
		return
	}
	if r.dependencies.Usage == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "usage_store_unavailable"})
		return
	}
	catalog, err := pricing.Load()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "pricing_unavailable"})
		return
	}
	customPrices, err := r.dependencies.Usage.ModelPrices(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "pricing_query_failed"})
		return
	}
	rates := buildRates(catalog, customPrices)
	now := time.Now().UTC()
	statuses := make([]gin.H, 0, len(budgets))
	for _, budget := range budgets {
		start := budgetPeriodStart(now, budget.Period)
		aggregates, queryErr := r.dependencies.Usage.CostAggregates(c.Request.Context(), start, now.Add(time.Nanosecond))
		if queryErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "budget_evaluation_failed"})
			return
		}
		var spent, unpriced int64
		for _, aggregate := range aggregates {
			if !budgetMatches(budget, aggregate) {
				continue
			}
			rate, ok := rates[strings.ToLower(strings.TrimSpace(aggregate.Model))]
			if !ok {
				unpriced = saturatingAdd(unpriced, aggregate.RequestCount)
				continue
			}
			spent = saturatingAdd(spent, aggregateCostMicro(aggregate, rate))
		}
		percentage := percentageOf(spent, budget.LimitMicroUSD)
		status := "ok"
		if !budget.Enabled {
			status = "disabled"
		} else if percentage >= 100 {
			status = "exceeded"
		} else if percentage >= budget.WarningPercent {
			status = "warning"
		}
		statuses = append(statuses, gin.H{"budget_id": budget.ID, "spent_usd": pricing.FormatMicro(spent), "limit_usd": pricing.FormatMicro(budget.LimitMicroUSD), "percentage": percentage, "period_start": start, "period_end": budgetPeriodEnd(start, budget.Period), "status": status, "unpriced_events": unpriced, "reason": ""})
	}
	c.JSON(200, gin.H{"statuses": statuses})
}

type modelRate struct {
	input, cached, output int64
}

func buildRates(catalog pricing.Catalog, custom []usage.ModelPrice) map[string]modelRate {
	rates := make(map[string]modelRate, len(catalog.Prices)*2+len(custom))
	for _, price := range catalog.Prices {
		input, _ := pricing.ParseMicro(string(price.InputPerMillion))
		cached, _ := pricing.ParseMicro(string(price.CachedInputPerMillion))
		output, _ := pricing.ParseMicro(string(price.OutputPerMillion))
		rate := modelRate{input: input, cached: cached, output: output}
		rates[strings.ToLower(price.Model)] = rate
		for _, alias := range price.Aliases {
			rates[strings.ToLower(strings.TrimSpace(alias))] = rate
		}
	}
	for _, price := range custom {
		input, errInput := pricing.ParseMicro(strconv.FormatFloat(price.InputPerMillion, 'f', 6, 64))
		cached, errCached := pricing.ParseMicro(strconv.FormatFloat(price.CachedInputPerMillion, 'f', 6, 64))
		output, errOutput := pricing.ParseMicro(strconv.FormatFloat(price.OutputPerMillion, 'f', 6, 64))
		if errInput == nil && errCached == nil && errOutput == nil {
			rates[strings.ToLower(strings.TrimSpace(price.Model))] = modelRate{input: input, cached: cached, output: output}
		}
	}
	return rates
}

func aggregateCostMicro(aggregate usage.CostAggregate, rate modelRate) int64 {
	uncached := aggregate.InputTokens - aggregate.CachedTokens
	if uncached < 0 {
		uncached = 0
	}
	output := aggregate.OutputTokens
	if inferred := aggregate.TotalTokens - aggregate.InputTokens; inferred > output {
		output = inferred
	}
	if output < 0 {
		output = 0
	}
	return saturatingAdd(saturatingAdd(microProduct(uncached, rate.input), microProduct(aggregate.CachedTokens, rate.cached)), microProduct(output, rate.output))
}

func saturatingAdd(left, right int64) int64 {
	const maxInt64 = int64(^uint64(0) >> 1)
	if right > 0 && left > maxInt64-right {
		return maxInt64
	}
	return left + right
}

func microProduct(tokens, rate int64) int64 {
	value := new(big.Int).Mul(big.NewInt(tokens), big.NewInt(rate))
	value.Quo(value, big.NewInt(1_000_000))
	if !value.IsInt64() {
		return int64(^uint64(0) >> 1)
	}
	return value.Int64()
}

func percentageOf(spent, limit int64) int {
	if limit <= 0 {
		return 0
	}
	value := new(big.Int).Mul(big.NewInt(spent), big.NewInt(100))
	value.Quo(value, big.NewInt(limit))
	if !value.IsInt64() || value.Int64() > int64(^uint(0)>>1) {
		return int(^uint(0) >> 1)
	}
	return int(value.Int64())
}

func budgetPeriodStart(now time.Time, period string) time.Time {
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if period == "week" {
		offset := (int(start.Weekday()) + 6) % 7
		return start.AddDate(0, 0, -offset)
	}
	if period == "month" {
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	}
	return start
}

func budgetPeriodEnd(start time.Time, period string) time.Time {
	if period == "week" {
		return start.AddDate(0, 0, 7)
	}
	if period == "month" {
		return start.AddDate(0, 1, 0)
	}
	return start.AddDate(0, 0, 1)
}

func budgetMatches(budget controlstore.Budget, aggregate usage.CostAggregate) bool {
	match := strings.TrimSpace(budget.MatchValue)
	switch budget.Scope {
	case "global":
		return true
	case "provider":
		return strings.EqualFold(match, aggregate.Provider)
	case "model":
		return strings.EqualFold(match, aggregate.Model)
	case "api_key":
		return match == aggregate.APIKeyHash
	default:
		return false
	}
}

func budgetDTOs(values []controlstore.Budget) []gin.H {
	out := make([]gin.H, 0, len(values))
	for _, v := range values {
		out = append(out, budgetDTO(v))
	}
	return out
}
func budgetDTO(v controlstore.Budget) gin.H {
	return gin.H{"id": v.ID, "name": v.Name, "scope": v.Scope, "match": v.MatchValue, "period": v.Period, "limit_usd": pricing.FormatMicro(v.LimitMicroUSD), "warning_percent": v.WarningPercent, "enabled": v.Enabled, "created_at": v.CreatedAt, "updated_at": v.UpdatedAt}
}
func validBudgetScope(scope, match string) bool {
	if scope == "global" {
		return strings.TrimSpace(match) == ""
	}
	return contains([]string{"provider", "model", "api_key"}, scope) && strings.TrimSpace(match) != ""
}
func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func (r *Registrar) syncDrift(c *gin.Context) {
	seconds := boundedInt(c.Query("stale_after_seconds"), 86400, 300, 604800)
	now := time.Now().UTC()
	rows := []gin.H{}
	if r.dependencies.SyncState != nil {
		snapshot := r.dependencies.SyncState.Snapshot()
		hosts := make([]string, 0, len(snapshot))
		for host := range snapshot {
			hosts = append(hosts, host)
		}
		sort.Strings(hosts)
		for _, host := range hosts {
			report := snapshot[host]
			tools := make([]string, 0, len(report.Tools))
			for tool := range report.Tools {
				tools = append(tools, tool)
			}
			sort.Strings(tools)
			for _, tool := range tools {
				item := report.Tools[tool]
				status := item.Status
				if status == "synced" && now.Sub(item.Timestamp) > time.Duration(seconds)*time.Second {
					status = "stale"
				}
				rows = append(rows, gin.H{"hostname": host, "profile": report.Profile, "tool": tool, "reported_at": item.Timestamp, "host_reported_at": report.ReportedAt, "status": status, "config_hash": item.ConfigHash, "error": item.Error})
			}
		}
	}
	c.JSON(200, gin.H{"reported_sync_state": rows, "stale_after_seconds": seconds})
}

func (r *Registrar) listDiagnostics(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	items, err := r.dependencies.Store.ListDiagnostics(c.Request.Context(), strings.TrimSpace(c.Query("target_kind")), strings.TrimSpace(c.Query("auth_index")), boundedInt(c.Query("limit"), 50, 1, 200))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "diagnostic_history_failed"})
		return
	}
	results := make([]gin.H, 0, len(items))
	for _, item := range items {
		results = append(results, diagnosticJSON(item))
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

// maxProbePayloadBytes bounds a caller-supplied debug payload.
const maxProbePayloadBytes = 32 * 1024

// diagnosticTimeout scopes each check at the route boundary.
//
// This is a cancellation deadline on an operator-initiated management call, the same shape
// AGENTS.md blesses for the management APICall path; no timeout is imposed inside the probe
// once an upstream connection is established. Streaming checks are bounded by chunk budget
// rather than wall clock, so they get the longest ceiling.
func diagnosticTimeout(check string) time.Duration {
	switch check {
	case "models", "catalog":
		return 10 * time.Second
	case "streaming":
		return 120 * time.Second
	case "connectivity":
		return 20 * time.Second
	default:
		return 60 * time.Second
	}
}

func (r *Registrar) runDiagnostic(c *gin.Context) {
	if !r.requireStore(c) {
		return
	}
	if r.dependencies.Probe == nil {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "diagnostics_unavailable"})
		return
	}
	var request struct {
		Target struct {
			Kind      string `json:"kind"`
			AuthIndex string `json:"auth_index"`
		} `json:"target"`
		Check               string          `json:"check"`
		AcknowledgeBillable bool            `json:"acknowledge_billable"`
		Model               string          `json:"model"`
		Payload             json.RawMessage `json:"payload"`
		Stream              bool            `json:"stream"`
		RunID               string          `json:"run_id"`
		AllKeys             bool            `json:"all_keys"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}
	request.Target.Kind = strings.TrimSpace(request.Target.Kind)
	request.Target.AuthIndex = strings.TrimSpace(request.Target.AuthIndex)
	request.Check = strings.TrimSpace(request.Check)
	// AllKeys addresses every credential of the kind, so it stands in for an auth index.
	if request.Target.Kind == "" || (request.Target.AuthIndex == "" && !request.AllKeys) || !port.IsProbeCheck(request.Check) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_target_or_check"})
		return
	}
	// Generalised from the original connectivity-only gate: every check that spends provider
	// tokens needs the acknowledgement, and a fan-out across keys multiplies that spend.
	if port.IsBillableProbeCheck(request.Check) && !request.AcknowledgeBillable {
		c.JSON(http.StatusBadRequest, gin.H{"error": "billable_acknowledgement_required"})
		return
	}
	if request.Check == "payload" {
		if len(bytes.TrimSpace(request.Payload)) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "payload_required"})
			return
		}
		// A debug button must not become a route for expensive conversations.
		if len(request.Payload) > maxProbePayloadBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "payload_too_large"})
			return
		}
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), diagnosticTimeout(request.Check))
	defer cancel()
	result, err := r.dependencies.Probe.Probe(ctx, port.ProbeTarget{
		Kind:      request.Target.Kind,
		AuthIndex: request.Target.AuthIndex,
		Model:     strings.TrimSpace(request.Model),
		Payload:   request.Payload,
		Stream:    request.Stream,
		RunID:     strings.TrimSpace(request.RunID),
		AllKeys:   request.AllKeys,
	}, request.Check)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			c.JSON(http.StatusGatewayTimeout, gin.H{"error": "diagnostic_timeout"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "diagnostic_target_unavailable"})
		return
	}
	detail, _ := json.Marshal(result.Detail)
	item := controlstore.Diagnostic{
		ID:              diagnosticID(),
		CheckedAt:       time.Now().UTC(),
		TargetKind:      request.Target.Kind,
		TargetAuthIndex: request.Target.AuthIndex,
		TargetLabel:     result.Label,
		CheckKind:       request.Check,
		Status:          result.Status,
		LatencyMS:       result.LatencyMS,
		HTTPStatus:      result.HTTPStatus,
		ModelCount:      result.ModelCount,
		Category:        result.Category,
		Message:         result.Message,
		DetailJSON:      detail,
	}
	if err = r.dependencies.Store.InsertDiagnostic(c.Request.Context(), item); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "diagnostic_store_failed"})
		return
	}
	c.JSON(http.StatusOK, diagnosticJSON(item))
}

func diagnosticJSON(item controlstore.Diagnostic) gin.H {
	var detail any = map[string]any{}
	if len(item.DetailJSON) > 0 {
		_ = json.Unmarshal(item.DetailJSON, &detail)
	}
	return gin.H{"id": item.ID, "checked_at": item.CheckedAt, "target": gin.H{"kind": item.TargetKind, "auth_index": item.TargetAuthIndex, "label": item.TargetLabel}, "check": item.CheckKind, "status": item.Status, "latency_ms": item.LatencyMS, "http_status": item.HTTPStatus, "model_count": item.ModelCount, "category": item.Category, "message": item.Message, "detail": detail}
}

func diagnosticID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return sha([]byte(strconv.FormatInt(time.Now().UnixNano(), 10)))[:32]
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16])
}
func boundedInt(raw string, fallback, min, max int) int {
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
func sha(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
