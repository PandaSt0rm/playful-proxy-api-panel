package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	managementHandlers "github.com/router-for-me/CLIProxyAPI/v7/internal/api/handlers/management"
)

type testManagementExtension struct {
	registerCalls atomic.Int32
	closeCalls    atomic.Int32
}

func (e *testManagementExtension) Register(group *gin.RouterGroup) {
	e.registerCalls.Add(1)
	group.GET("/probe", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}

func (e *testManagementExtension) Close() error {
	e.closeCalls.Add(1)
	return nil
}

func TestManagementExtensionUsesAuthenticatedGroupAndClosesOnce(t *testing.T) {
	t.Setenv("MANAGEMENT_PASSWORD", "extension-secret")
	extension := &testManagementExtension{}
	server := newTestServerWithOptions(t, WithManagementExtensionFactory(func(_ *managementHandlers.Handler) ManagementExtensionRegistrar {
		return extension
	}))

	if extension.registerCalls.Load() != 1 {
		t.Fatalf("Register calls = %d, want 1", extension.registerCalls.Load())
	}

	unauthenticated := httptest.NewRecorder()
	server.engine.ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/v0/management/aiproxy/probe", nil))
	if unauthenticated.Code != http.StatusUnauthorized && unauthenticated.Code != http.StatusForbidden {
		t.Fatalf("unauthenticated status = %d, want authentication rejection", unauthenticated.Code)
	}

	authenticatedRequest := httptest.NewRequest(http.MethodGet, "/v0/management/aiproxy/probe", nil)
	authenticatedRequest.Header.Set("Authorization", "Bearer extension-secret")
	authenticated := httptest.NewRecorder()
	server.engine.ServeHTTP(authenticated, authenticatedRequest)
	if authenticated.Code != http.StatusOK {
		t.Fatalf("authenticated status = %d, want %d", authenticated.Code, http.StatusOK)
	}

	if err := server.Stop(context.Background()); err != nil {
		t.Fatalf("first Stop() error = %v", err)
	}
	if err := server.Stop(context.Background()); err != nil {
		t.Fatalf("second Stop() error = %v", err)
	}
	if extension.closeCalls.Load() != 1 {
		t.Fatalf("Close calls = %d, want 1", extension.closeCalls.Load())
	}
}
