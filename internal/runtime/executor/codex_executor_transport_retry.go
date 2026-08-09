package executor

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/runtime/executor/helps"
	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	log "github.com/sirupsen/logrus"
	"github.com/tidwall/sjson"
)

const codexTransportRetryLimit = 1

var codexTransientTransportRetryDelay = defaultCodexTransientTransportRetryDelay

func (e *CodexExecutor) doCodexRequestWithTransportRetry(ctx context.Context, auth *cliproxyauth.Auth, reporter *helps.UsageReporter, logInfo helps.UpstreamRequestLog, newRequest func() (*http.Request, error)) (*http.Response, error) {
	if newRequest == nil {
		return nil, fmt.Errorf("codex executor: request factory is nil")
	}
	var lastErr error
	for attempt := 0; attempt <= codexTransportRetryLimit; attempt++ {
		httpReq, errReq := newRequest()
		if errReq != nil {
			return nil, errReq
		}
		attemptLog := logInfo
		attemptLog.Headers = httpReq.Header.Clone()
		helps.RecordAPIRequest(ctx, e.cfg, attemptLog)

		httpClient := helps.NewUtlsHTTPClient(ctx, e.cfg, auth, 0)
		httpClient = reporter.TrackHTTPClient(httpClient)
		httpResp, errDo := httpClient.Do(httpReq)
		if errDo == nil {
			return httpResp, nil
		}
		helps.RecordAPIResponseError(ctx, e.cfg, errDo)
		lastErr = errDo
		if attempt >= codexTransportRetryLimit || !isRetryableCodexTransportError(errDo) {
			break
		}
		delay := codexTransientTransportRetryDelay()
		log.WithFields(log.Fields{
			"attempt":  attempt + 1,
			"provider": e.Identifier(),
			"delay_ms": delay.Milliseconds(),
		}).Warnf("codex executor: retrying transient upstream transport error: %v", errDo)
		if errWait := waitCodexTransportRetry(ctx, delay); errWait != nil {
			return nil, errWait
		}
	}
	return nil, newCodexTransportErr(lastErr)
}

func waitCodexTransportRetry(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func defaultCodexTransientTransportRetryDelay() time.Duration {
	return 150*time.Millisecond + time.Duration(rand.Int64N(int64(350*time.Millisecond)))
}

func isRetryableCodexTransportError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	if msg == "" {
		return false
	}
	retryableMarkers := []string{
		"connection reset by peer",
		"server closed idle connection",
		"use of closed network connection",
		"unexpected eof",
		"stream error",
		"http2: server sent goaway",
		"tls: bad record mac",
	}
	for _, marker := range retryableMarkers {
		if strings.Contains(msg, marker) {
			return true
		}
	}
	return msg == "eof" || strings.HasSuffix(msg, ": eof")
}

func newCodexTransportErr(err error) statusErr {
	message := "upstream transport error"
	if err != nil {
		message = fmt.Sprintf("upstream transport error: %s", err.Error())
	}
	body := []byte(`{"error":{}}`)
	body, _ = sjson.SetBytes(body, "error.message", message)
	body, _ = sjson.SetBytes(body, "error.type", "server_error")
	body, _ = sjson.SetBytes(body, "error.code", "upstream_transport_eof")
	return statusErr{code: http.StatusBadGateway, msg: string(body)}
}
