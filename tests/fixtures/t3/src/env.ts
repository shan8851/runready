type SchemaChain = {
  default: (value: string) => SchemaChain;
  optional: () => SchemaChain;
  url: () => SchemaChain;
};

const schemaChain: SchemaChain = {
  default: () => schemaChain,
  optional: () => schemaChain,
  url: () => schemaChain
};

const z = {
  string: (): SchemaChain => schemaChain
};

const createEnv = <Config>(config: Config): Config => config;

export const env = createEnv({
  server: {
    REQUIRED_URL: z.string().url(),
    OPTIONAL_TOKEN: z.string().optional(),
    DEFAULT_REGION: z.string().default("eu")
  },
  runtimeEnv: {
    REQUIRED_URL: process.env.REQUIRED_URL,
    OPTIONAL_TOKEN: process.env.OPTIONAL_TOKEN,
    DEFAULT_REGION: process.env.DEFAULT_REGION
  }
});
