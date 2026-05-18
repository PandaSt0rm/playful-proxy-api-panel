package management

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/misc"
)

type oauthCallbackRequest struct {
	Provider    string `json:"provider"`
	RedirectURL string `json:"redirect_url"`
	Code        string `json:"code"`
	State       string `json:"state"`
	Error       string `json:"error"`
}

func (h *Handler) PostOAuthCallback(c *gin.Context) {
	if h == nil || h.cfg == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "error": "handler not initialized"})
		return
	}

	var req oauthCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": "invalid body"})
		return
	}

	canonicalProvider, err := NormalizeOAuthProvider(req.Provider)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": "unsupported provider"})
		return
	}

	state, code, errMsg, errParse := parseOAuthCallbackRequest(req)
	if errParse != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": errParse.Error()})
		return
	}

	if state == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": "state is required"})
		return
	}
	if err := ValidateOAuthState(state); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": "invalid state"})
		return
	}
	if code == "" && errMsg == "" {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": "code or error is required"})
		return
	}

	sessionProvider, sessionStatus, ok := GetOAuthSession(state)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"status": "error", "error": "unknown or expired state"})
		return
	}
	if sessionStatus != "" {
		c.JSON(http.StatusConflict, gin.H{"status": "error", "error": sessionStatus})
		return
	}
	if !strings.EqualFold(sessionProvider, canonicalProvider) {
		c.JSON(http.StatusBadRequest, gin.H{"status": "error", "error": "provider does not match state"})
		return
	}

	if _, errWrite := WriteOAuthCallbackFileForPendingSession(h.cfg.AuthDir, canonicalProvider, state, code, errMsg); errWrite != nil {
		if errors.Is(errWrite, errOAuthSessionNotPending) {
			_, status, okSession := GetOAuthSession(state)
			if okSession && status != "" {
				c.JSON(http.StatusConflict, gin.H{"status": "error", "error": status})
				return
			}
			c.JSON(http.StatusConflict, gin.H{"status": "error", "error": "oauth flow is not pending"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"status": "error", "error": "failed to persist oauth callback"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func parseOAuthCallbackRequest(req oauthCallbackRequest) (state, code, errMsg string, err error) {
	state = strings.TrimSpace(req.State)
	code = strings.TrimSpace(req.Code)
	errMsg = strings.TrimSpace(req.Error)

	rawRedirect := strings.TrimSpace(req.RedirectURL)
	if rawRedirect == "" {
		return state, code, errMsg, nil
	}

	parsed, errParse := misc.ParseOAuthCallbackInput(rawRedirect, state)
	if errParse != nil {
		if errors.Is(errParse, misc.ErrOAuthAuthorizationURL) {
			return "", "", "", errors.New("authorization URL submitted; paste the callback URL or the raw authorization code shown by the provider")
		}
		return "", "", "", errors.New("invalid redirect_url")
	}
	if parsed == nil {
		return state, code, errMsg, nil
	}

	parsedState := strings.TrimSpace(parsed.State)
	if parsedState != "" {
		if state != "" && state != parsedState {
			return "", "", "", errors.New("state does not match callback URL")
		}
		state = parsedState
	}
	if parsed.Code != "" {
		code = strings.TrimSpace(parsed.Code)
	}
	parsedError := strings.TrimSpace(parsed.Error)
	if parsedError == "" {
		parsedError = strings.TrimSpace(parsed.ErrorDescription)
	}
	if parsedError != "" {
		errMsg = parsedError
	}
	return state, code, errMsg, nil
}
