package pricing

import (
	"encoding/json"
	"testing"
)

func TestCatalogUsesFixedSixPlaceDecimals(t *testing.T) {
	for input, want := range map[string]int64{"0": 0, "0.000001": 1, "1.25": 1_250_000, "30": 30_000_000} {
		got, err := ParseMicro(input)
		if err != nil {
			t.Fatalf("ParseMicro(%q) error = %v", input, err)
		}
		if got != want {
			t.Fatalf("ParseMicro(%q) = %d, want %d", input, got, want)
		}
	}
	if _, err := ParseMicro("0.0000001"); err == nil {
		t.Fatal("expected precision error")
	}
	catalog, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(catalog)
	if err != nil {
		t.Fatal(err)
	}
	if len(encoded) == 0 || len(catalog.Prices) == 0 {
		t.Fatal("empty pricing catalog")
	}
}
