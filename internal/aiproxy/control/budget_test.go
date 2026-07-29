package control

import (
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/usage"
)

func TestAggregateCostMicroUsesCachedAndInferredOutput(t *testing.T) {
	aggregate := usage.CostAggregate{InputTokens: 1_000_000, CachedTokens: 250_000, OutputTokens: 0, TotalTokens: 1_500_000}
	rate := modelRate{input: 1_000_000, cached: 500_000, output: 2_000_000}
	if got, want := aggregateCostMicro(aggregate, rate), int64(1_875_000); got != want {
		t.Fatalf("cost = %d micro USD, want %d", got, want)
	}
}

func TestPercentageOfAvoidsIntegerOverflow(t *testing.T) {
	const maxInt64 = int64(^uint64(0) >> 1)
	if got := percentageOf(maxInt64, maxInt64); got != 100 {
		t.Fatalf("percentage = %d, want 100", got)
	}
}
