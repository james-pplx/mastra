import { beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayRegistrySyncGateways = vi.fn();
const gatewayRegistryGetProviders = vi.fn(() => ({}));
const gatewayRegistryGetInstance = vi.fn(() => ({
  syncGateways: gatewayRegistrySyncGateways,
  getProviders: gatewayRegistryGetProviders,
}));

vi.mock('@mastra/core/llm', () => ({
  GatewayRegistry: {
    getInstance: gatewayRegistryGetInstance,
  },
  PROVIDER_REGISTRY: {},
}));

vi.mock('@mastra/core/agent', () => ({
  Agent: class {},
}));

const createDurableAgentMock = vi.fn(({ agent }: { agent: unknown }) => ({ durableWrappedAgent: agent }));

vi.mock('@mastra/core/agent/durable', () => ({
  createDurableAgent: createDurableAgentMock,
}));

const harnessConstructorMock = vi.fn();

(vi.mock as any)(
  '@mastra/tavily',
  () => ({
    createTavilySearchTool: vi.fn(() => ({})),
    createTavilyExtractTool: vi.fn(() => ({})),
  }),
  { virtual: true },
);
vi.mock('../tools/index.js', () => ({
  createWebSearchTool: vi.fn(() => ({})),
  createWebExtractTool: vi.fn(() => ({})),
  hasTavilyKey: vi.fn(() => false),
  requestSandboxAccessTool: {},
}));
vi.mock('../tools', () => ({
  createWebSearchTool: vi.fn(() => ({})),
  createWebExtractTool: vi.fn(() => ({})),
  hasTavilyKey: vi.fn(() => false),
  requestSandboxAccessTool: {},
}));
vi.mock('../tools/index.ts', () => ({
  createWebSearchTool: vi.fn(() => ({})),
  createWebExtractTool: vi.fn(() => ({})),
  hasTavilyKey: vi.fn(() => false),
  requestSandboxAccessTool: {},
}));
vi.mock('../tools/web-search.ts', () => ({
  createWebSearchTool: vi.fn(() => ({})),
  createWebExtractTool: vi.fn(() => ({})),
  hasTavilyKey: vi.fn(() => false),
}));

vi.mock('@mastra/core/harness', () => ({
  Harness: class {
    constructor(config: unknown) {
      harnessConstructorMock(config);
    }
    subscribe() {}
  },
  taskWriteTool: {},
  taskCheckTool: {},
}));

vi.mock('./agents/instructions.js', () => ({
  getDynamicInstructions: vi.fn(),
}));

const getDynamicMemoryMock = vi.fn();

vi.mock('./agents/memory.js', () => ({
  getDynamicMemory: getDynamicMemoryMock,
}));

vi.mock('./agents/model.js', () => ({
  getDynamicModel: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock('./agents/subagents/execute.js', () => ({
  executeSubagent: {},
}));

vi.mock('./agents/subagents/explore.js', () => ({
  exploreSubagent: {},
}));

vi.mock('./agents/subagents/plan.js', () => ({
  planSubagent: {},
}));

vi.mock('./agents/tools.js', () => ({
  createDynamicTools: vi.fn(),
}));
vi.mock('../agents/tools.js', () => ({
  createDynamicTools: vi.fn(),
}));

vi.mock('./agents/workspace.js', () => ({
  getDynamicWorkspace: vi.fn(),
}));

vi.mock('./auth/storage.js', () => ({
  AuthStorage: class {
    get() {
      return undefined;
    }
    loadStoredApiKeysIntoEnv() {}
  },
}));

vi.mock('./hooks/index.js', () => ({
  HookManager: class {},
}));

vi.mock('./mcp/index.js', () => ({
  createMcpManager: vi.fn(),
}));

vi.mock('./onboarding/packs.js', () => ({
  getAvailableModePacks: vi.fn(() => []),
  getAvailableOmPacks: vi.fn(() => []),
}));

vi.mock('./onboarding/settings.js', () => ({
  getCustomProviderId: vi.fn(),
  loadSettings: vi.fn(() => ({ customProviders: [], modelUseCounts: {}, models: { modeDefaults: {} } })),
  resolveModelDefaults: vi.fn(() => ({ build: '', plan: '', fast: '' })),
  resolveOmModel: vi.fn(() => ''),
  resolveOmRoleModel: vi.fn(() => ''),
  saveSettings: vi.fn(),
  toCustomProviderModelId: vi.fn(),
}));

vi.mock('./permissions.js', () => ({
  getToolCategory: vi.fn(),
}));

vi.mock('./providers/claude-max.js', () => ({
  setAuthStorage: vi.fn(),
}));

vi.mock('./providers/openai-codex.js', () => ({
  setAuthStorage: vi.fn(),
}));

vi.mock('./schema.js', () => ({
  stateSchema: {},
}));

vi.mock('./tui/theme.js', () => ({
  mastra: {},
}));

vi.mock('./utils/gateway-sync.js', () => ({
  syncGateways: vi.fn(),
}));

vi.mock('./utils/project.js', () => ({
  detectProject: vi.fn(() => ({
    mode: 'none',
    resourceId: 'test-project-resource',
    name: 'test-project',
    rootPath: process.cwd(),
    packageManager: 'pnpm',
    hasGit: false,
    contextFiles: [],
  })),
  getStorageConfig: vi.fn(() => ({ type: 'memory' })),
  getResourceIdOverride: vi.fn(() => undefined),
}));

const createStorageMock = vi.fn(() => ({ storage: {} }));
const createVectorStoreMock = vi.fn(() => ({}));

vi.mock('./utils/storage-factory.js', () => ({
  createStorage: createStorageMock,
  createVectorStore: createVectorStoreMock,
}));

vi.mock('./utils/thread-lock.js', () => ({
  acquireThreadLock: vi.fn(),
  releaseThreadLock: vi.fn(),
}));

describe('createMastraCode', () => {
  beforeEach(() => {
    vi.resetModules();
    gatewayRegistrySyncGateways.mockReset();
    gatewayRegistryGetProviders.mockReset();
    gatewayRegistryGetProviders.mockReturnValue({});
    gatewayRegistryGetInstance.mockClear();
    createStorageMock.mockReset();
    createStorageMock.mockReturnValue({ storage: {} });
    createVectorStoreMock.mockReset();
    createVectorStoreMock.mockReturnValue({});
    createDurableAgentMock.mockClear();
    getDynamicMemoryMock.mockReset();
    harnessConstructorMock.mockReset();
    gatewayRegistryGetInstance.mockImplementation(() => ({
      syncGateways: gatewayRegistrySyncGateways,
      getProviders: gatewayRegistryGetProviders,
    }));
  });

  it('enables dynamic provider registry loading before bootstrapping auth and models', async () => {
    const { createMastraCode } = await import('../index.js');

    await createMastraCode();

    expect(gatewayRegistryGetInstance).toHaveBeenCalledWith({ useDynamicLoading: true });
  });

  it('forces a gateway sync after loading stored API keys', async () => {
    const { createMastraCode } = await import('../index.js');

    await createMastraCode();

    expect(gatewayRegistrySyncGateways).toHaveBeenCalledWith(true);
  });

  it('always configures dynamic local memory at startup', async () => {
    const { createMastraCode } = await import('../index.js');

    await createMastraCode();

    expect(harnessConstructorMock).toHaveBeenCalled();
    const harnessConfig = harnessConstructorMock.mock.calls[0]?.[0] as { memory?: unknown } | undefined;
    expect(typeof harnessConfig?.memory).toBe('function');
  });

  it('wraps the default code agent and enables durable multiplayer streams', async () => {
    const { createMastraCode } = await import('../index.js');

    await createMastraCode();

    expect(createDurableAgentMock).toHaveBeenCalledTimes(1);
    const harnessConfig = harnessConstructorMock.mock.calls[0]?.[0] as
      | {
          durableStreams?: { unixSocketPath?: string; attachToActiveThread?: boolean; signalWhileRunning?: boolean };
          threadLock?: unknown;
          modes?: Array<{ agent?: unknown }>;
        }
      | undefined;

    expect(harnessConfig?.durableStreams).toMatchObject({
      attachToActiveThread: true,
      signalWhileRunning: true,
    });
    expect(harnessConfig?.durableStreams?.unixSocketPath).toMatch(/mastracode-[a-f0-9]{16}\.sock$/);
    expect(harnessConfig?.threadLock).toBeUndefined();
    expect(harnessConfig?.modes?.map(mode => mode.agent)).toEqual([
      { durableWrappedAgent: expect.anything() },
      { durableWrappedAgent: expect.anything() },
      { durableWrappedAgent: expect.anything() },
    ]);
  });
});
