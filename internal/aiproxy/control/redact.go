package control

import (
	"fmt"
	"net/url"
	"strings"

	"gopkg.in/yaml.v3"
)

var secretKeys = map[string]struct{}{
	"api-key": {}, "api-keys": {}, "secret-key": {}, "client-secret": {}, "private-key": {},
	"password": {}, "token": {}, "access-token": {}, "refresh-token": {}, "credential": {},
}

func RedactYAML(data []byte) ([]byte, error) {
	var document yaml.Node
	if err := yaml.Unmarshal(data, &document); err != nil {
		return nil, fmt.Errorf("parse YAML for redaction: %w", err)
	}
	redactNode(&document, nil)
	return yaml.Marshal(&document)
}

func redactNode(node *yaml.Node, path []string) {
	if node.Kind == yaml.DocumentNode && len(node.Content) > 0 {
		redactNode(node.Content[0], path)
		return
	}
	if node.Kind == yaml.SequenceNode {
		for _, child := range node.Content {
			redactNode(child, path)
		}
		return
	}
	if node.Kind != yaml.MappingNode {
		return
	}
	for i := 0; i+1 < len(node.Content); i += 2 {
		key, value := node.Content[i], node.Content[i+1]
		segment := strings.ToLower(strings.TrimSpace(key.Value))
		childPath := append(append([]string(nil), path...), segment)
		_, directSecret := secretKeys[segment]
		underHeaders := containsSegment(path, "headers")
		underPluginConfigs := hasSequence(path, "plugins", "configs")
		if directSecret || underHeaders || underPluginConfigs {
			redactAllScalars(value)
			continue
		}
		if segment == "proxy-url" && value.Kind == yaml.ScalarNode {
			value.Value = redactProxyURL(value.Value)
			continue
		}
		redactNode(value, childPath)
	}
}

func redactAllScalars(node *yaml.Node) {
	if node.Kind == yaml.ScalarNode {
		node.Value = "••••"
		node.Tag = "!!str"
		return
	}
	for _, child := range node.Content {
		redactAllScalars(child)
	}
}

func redactProxyURL(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.User == nil {
		return value
	}
	parsed.User = url.UserPassword("••••", "••••")
	return parsed.String()
}

func containsSegment(path []string, segment string) bool {
	for _, current := range path {
		if current == segment {
			return true
		}
	}
	return false
}

func hasSequence(path []string, first, second string) bool {
	for i := 0; i+1 < len(path); i++ {
		if path[i] == first && path[i+1] == second {
			return true
		}
	}
	return false
}

func RedactedDiff(before, after []byte) (string, error) {
	redactedBefore, err := RedactYAML(before)
	if err != nil {
		return "", err
	}
	redactedAfter, err := RedactYAML(after)
	if err != nil {
		return "", err
	}
	return "--- before\n+++ after\n-" + strings.ReplaceAll(strings.TrimSuffix(string(redactedBefore), "\n"), "\n", "\n-") + "\n+" + strings.ReplaceAll(strings.TrimSuffix(string(redactedAfter), "\n"), "\n", "\n+") + "\n", nil
}
