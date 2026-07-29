package oauthbridge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

const (
	ProtocolVersion   = 1
	DefaultSocketPath = "/run/aiproxy/oauth-bridge.sock"
	maxFrameSize      = 16 * 1024
)

var (
	ErrPortInUse         = errors.New("oauth callback port is in use")
	ErrBridgeUnavailable = errors.New("oauth callback bridge is unavailable")
)

type AcquireRequest struct {
	Version  int    `json:"version"`
	Type     string `json:"type"`
	Provider string `json:"provider"`
	State    string `json:"state"`
	Port     int    `json:"port"`
}

type Callback struct {
	State string `json:"state"`
	Code  string `json:"code"`
	Error string `json:"error"`
}

type CallbackResult struct {
	Status int    `json:"status"`
	Error  string `json:"error,omitempty"`
}

type CallbackHandler func(context.Context, Callback) CallbackResult

type frame struct {
	Version  int    `json:"version"`
	Type     string `json:"type"`
	Provider string `json:"provider,omitempty"`
	State    string `json:"state,omitempty"`
	Port     int    `json:"port,omitempty"`
	Code     string `json:"code,omitempty"`
	Error    string `json:"error,omitempty"`
	Status   int    `json:"status,omitempty"`
}

type readyFrame struct {
	Version int    `json:"version"`
	Type    string `json:"type"`
}

type errorFrame struct {
	Version int    `json:"version"`
	Type    string `json:"type"`
	Code    string `json:"code"`
	Error   string `json:"error"`
}

type callbackFrame struct {
	Version int    `json:"version"`
	Type    string `json:"type"`
	State   string `json:"state"`
	Code    string `json:"code"`
	Error   string `json:"error"`
}

type callbackResultFrame struct {
	Version int    `json:"version"`
	Type    string `json:"type"`
	Status  int    `json:"status"`
	Error   string `json:"error"`
}

// Lease owns one callback state on the bridge until Close or bridge termination.
type Lease struct {
	conn      net.Conn
	handler   CallbackHandler
	done      chan struct{}
	closeOnce sync.Once
	mu        sync.RWMutex
	err       error
	closing   atomic.Bool
	delivered atomic.Bool
}

func Acquire(ctx context.Context, socketPath string, request AcquireRequest, handler CallbackHandler) (*Lease, error) {
	if handler == nil {
		return nil, fmt.Errorf("%w: callback handler is required", ErrBridgeUnavailable)
	}
	conn, err := (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
	if err != nil {
		return nil, fmt.Errorf("%w: dial bridge: %v", ErrBridgeUnavailable, err)
	}
	failed := true
	defer func() {
		if failed {
			_ = conn.Close()
		}
	}()

	if deadline, ok := ctx.Deadline(); ok {
		if err = conn.SetDeadline(deadline); err != nil {
			return nil, fmt.Errorf("%w: set handshake deadline: %v", ErrBridgeUnavailable, err)
		}
	}
	request.Version = ProtocolVersion
	request.Type = "acquire"
	if err = writeFrame(conn, request); err != nil {
		return nil, fmt.Errorf("%w: send acquire request: %v", ErrBridgeUnavailable, err)
	}

	reader := bufio.NewReaderSize(conn, maxFrameSize+1)
	var response frame
	if err = readFrame(reader, &response); err != nil {
		return nil, fmt.Errorf("%w: read acquire response: %v", ErrBridgeUnavailable, err)
	}
	if response.Version != ProtocolVersion {
		return nil, fmt.Errorf("%w: unsupported bridge protocol version", ErrBridgeUnavailable)
	}
	if response.Type == "error" {
		if response.Code == "port_in_use" {
			return nil, fmt.Errorf("%w: %s", ErrPortInUse, response.Error)
		}
		return nil, fmt.Errorf("%w: %s", ErrBridgeUnavailable, response.Error)
	}
	if response.Type != "ready" {
		return nil, fmt.Errorf("%w: unexpected acquire response", ErrBridgeUnavailable)
	}
	if err = conn.SetDeadline(time.Time{}); err != nil {
		return nil, fmt.Errorf("%w: clear handshake deadline: %v", ErrBridgeUnavailable, err)
	}

	lease := &Lease{conn: conn, handler: handler, done: make(chan struct{})}
	failed = false
	go lease.readCallbacks(reader)
	return lease, nil
}

func (l *Lease) Close() error {
	if l == nil {
		return nil
	}
	l.closeOnce.Do(func() {
		l.closing.Store(true)
		_ = l.conn.Close()
	})
	<-l.done
	return l.Err()
}

func (l *Lease) Done() <-chan struct{} {
	if l == nil {
		closed := make(chan struct{})
		close(closed)
		return closed
	}
	return l.done
}

func (l *Lease) Err() error {
	if l == nil {
		return nil
	}
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.err
}

func (l *Lease) CallbackDelivered() bool {
	return l != nil && l.delivered.Load()
}

func (l *Lease) readCallbacks(reader *bufio.Reader) {
	defer close(l.done)
	for {
		var incoming frame
		if err := readFrame(reader, &incoming); err != nil {
			if !l.closing.Load() {
				l.setError(fmt.Errorf("%w: callback connection stopped: %v", ErrBridgeUnavailable, err))
			}
			return
		}
		if incoming.Version != ProtocolVersion || incoming.Type != "callback" {
			l.setError(fmt.Errorf("%w: unexpected callback frame", ErrBridgeUnavailable))
			_ = l.conn.Close()
			return
		}

		result := l.handler(context.Background(), Callback{State: incoming.State, Code: incoming.Code, Error: incoming.Error})
		outgoing := callbackResultFrame{Version: ProtocolVersion, Type: "callback_result", Status: result.Status, Error: result.Error}
		if err := writeFrame(l.conn, outgoing); err != nil {
			l.setError(fmt.Errorf("%w: send callback result: %v", ErrBridgeUnavailable, err))
			_ = l.conn.Close()
			return
		}
		if result.Status == http.StatusOK {
			l.delivered.Store(true)
		}
	}
}

func (l *Lease) setError(err error) {
	l.mu.Lock()
	if l.err == nil {
		l.err = err
	}
	l.mu.Unlock()
}

func writeFrame(writer io.Writer, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if len(payload) > maxFrameSize {
		return fmt.Errorf("frame exceeds %d bytes", maxFrameSize)
	}
	payload = append(payload, '\n')
	for len(payload) > 0 {
		written, writeErr := writer.Write(payload)
		if writeErr != nil {
			return writeErr
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		payload = payload[written:]
	}
	return nil
}

func readFrame(reader *bufio.Reader, target any) error {
	payload, err := reader.ReadSlice('\n')
	if errors.Is(err, bufio.ErrBufferFull) {
		return fmt.Errorf("frame exceeds %d bytes", maxFrameSize)
	}
	if err != nil {
		return err
	}
	payload = bytes.TrimSuffix(payload, []byte{'\n'})
	if len(payload) == 0 || len(payload) > maxFrameSize {
		return fmt.Errorf("invalid frame size")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(target); err != nil {
		return err
	}
	if err = decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return fmt.Errorf("frame contains trailing data")
	}
	return nil
}
