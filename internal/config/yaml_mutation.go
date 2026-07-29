package config

// YAMLMutation captures one immutable configuration transition.
type YAMLMutation struct {
	Config       *Config
	BeforeYAML   []byte
	AfterYAML    []byte
	BeforeSHA256 string
	AfterSHA256  string
}
