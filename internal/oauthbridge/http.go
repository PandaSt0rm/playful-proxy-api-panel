package oauthbridge

import (
	"io"
	"net/http"
	"strings"
)

const (
	maxCallbackRequestSize = 64 * 1024
	callbackSuccessHTML    = `<html><head><meta charset="utf-8"><title>Authentication successful</title><script>setTimeout(function(){window.close();},5000);</script></head><body><h1>Authentication successful!</h1><p>You can close this window.</p><p>This window will close automatically in 5 seconds.</p></body></html>`
)

func NewCallbackHTTPHandler(handler CallbackHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		setCallbackHeaders(w, r)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		querySize := len(r.URL.RawQuery)
		if querySize > maxCallbackRequestSize {
			http.Error(w, "invalid callback request", http.StatusBadRequest)
			return
		}
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, int64(maxCallbackRequestSize-querySize))
		}
		if err := r.ParseForm(); err != nil {
			http.Error(w, "invalid callback request", http.StatusBadRequest)
			return
		}

		callback := Callback{
			State: strings.TrimSpace(r.Form.Get("state")),
			Code:  strings.TrimSpace(r.Form.Get("code")),
			Error: strings.TrimSpace(r.Form.Get("error")),
		}
		if callback.Error == "" {
			callback.Error = strings.TrimSpace(r.Form.Get("error_description"))
		}
		if callback.State == "" {
			http.Error(w, "state is required", http.StatusBadRequest)
			return
		}
		if callback.Code == "" && callback.Error == "" {
			http.Error(w, "code or error is required", http.StatusBadRequest)
			return
		}

		result := handler(r.Context(), callback)
		if result.Status == http.StatusOK {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, callbackSuccessHTML)
			return
		}
		if result.Status != http.StatusBadRequest && result.Status != http.StatusConflict && result.Status != http.StatusInternalServerError {
			result.Status = http.StatusInternalServerError
		}
		if strings.TrimSpace(result.Error) == "" {
			result.Error = http.StatusText(result.Status)
		}
		http.Error(w, result.Error, result.Status)
	})
}

func setCallbackHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Add("Vary", "Origin")
}
