package pricing

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed catalog.json
var catalogFS embed.FS

type Decimal string

func (d Decimal) MarshalJSON() ([]byte, error) {
	if _, err := ParseMicro(string(d)); err != nil {
		return nil, err
	}
	return []byte(d), nil
}

type Price struct {
	Model                 string   `json:"model"`
	Aliases               []string `json:"aliases"`
	InputPerMillion       Decimal  `json:"input_per_million"`
	CachedInputPerMillion Decimal  `json:"cached_input_per_million"`
	OutputPerMillion      Decimal  `json:"output_per_million"`
	Source                string   `json:"source"`
}

type Catalog struct {
	Currency  string  `json:"currency"`
	Unit      string  `json:"unit"`
	UpdatedAt string  `json:"updated_at"`
	Prices    []Price `json:"prices"`
}

type rawCatalog struct {
	Currency  string                                `json:"currency"`
	Unit      string                                `json:"unit"`
	UpdatedAt string                                `json:"updated_at"`
	Models    map[string]map[string]json.RawMessage `json:"models"`
}

func Load() (Catalog, error) {
	data, err := catalogFS.ReadFile("catalog.json")
	if err != nil {
		return Catalog{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var raw rawCatalog
	if err = decoder.Decode(&raw); err != nil {
		return Catalog{}, fmt.Errorf("decode pricing catalog: %w", err)
	}
	catalog := Catalog{Currency: raw.Currency, Unit: raw.Unit, UpdatedAt: raw.UpdatedAt}
	for model, fields := range raw.Models {
		price := Price{Model: model, Source: "embedded", Aliases: []string{}}
		if price.InputPerMillion, err = rawDecimal(fields["input"]); err != nil {
			return Catalog{}, fmt.Errorf("%s input: %w", model, err)
		}
		if price.CachedInputPerMillion, err = rawDecimal(fields["cached_input"]); err != nil {
			return Catalog{}, fmt.Errorf("%s cached input: %w", model, err)
		}
		if price.OutputPerMillion, err = rawDecimal(fields["output"]); err != nil {
			return Catalog{}, fmt.Errorf("%s output: %w", model, err)
		}
		if aliases := fields["aliases"]; len(aliases) > 0 {
			if err = json.Unmarshal(aliases, &price.Aliases); err != nil {
				return Catalog{}, err
			}
		}
		catalog.Prices = append(catalog.Prices, price)
	}
	sort.Slice(catalog.Prices, func(i, j int) bool { return catalog.Prices[i].Model < catalog.Prices[j].Model })
	return catalog, nil
}

func rawDecimal(raw json.RawMessage) (Decimal, error) {
	value := strings.TrimSpace(string(raw))
	if _, err := ParseMicro(value); err != nil {
		return "", err
	}
	return Decimal(value), nil
}

func ParseMicro(value string) (int64, error) {
	value = strings.TrimSpace(value)
	if value == "" || strings.HasPrefix(value, "-") || strings.ContainsAny(value, "eE") {
		return 0, fmt.Errorf("invalid non-negative decimal %q", value)
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || len(parts[0]) == 0 {
		return 0, fmt.Errorf("invalid decimal %q", value)
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 6 {
		return 0, fmt.Errorf("more than six fractional digits")
	}
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid decimal %q", value)
	}
	for len(fraction) < 6 {
		fraction += "0"
	}
	fractionValue := int64(0)
	if fraction != "" {
		fractionValue, err = strconv.ParseInt(fraction, 10, 64)
	}
	if err != nil || whole > (1<<63-1-fractionValue)/1_000_000 {
		return 0, fmt.Errorf("decimal out of range")
	}
	return whole*1_000_000 + fractionValue, nil
}

func FormatMicro(value int64) Decimal {
	whole := value / 1_000_000
	fraction := value % 1_000_000
	if fraction == 0 {
		return Decimal(strconv.FormatInt(whole, 10))
	}
	return Decimal(strings.TrimRight(fmt.Sprintf("%d.%06d", whole, fraction), "0"))
}

func NowUpdatedAt() string { return time.Now().UTC().Format(time.RFC3339) }
