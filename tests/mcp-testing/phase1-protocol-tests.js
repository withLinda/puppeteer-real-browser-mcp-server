const MCPTestClient = require('./mcp-test-client');

class Phase1ProtocolTests {
  constructor(logger) {
    this.logger = logger;
    this.client = new MCPTestClient(logger);
  }

  async run() {
    this.logger.startPhase('Phase 1', 'MCP Client Connection Testing');

    try {
      // Start the MCP server
      await this.client.start();

      // Test 1.1: End-to-End MCP Client Connection
      await this.testClientConnection();

    } catch (error) {
      this.logger.log(`Phase 1 critical error: ${error.message}`, 'ERROR');
    } finally {
      await this.client.stop();
      this.logger.endPhase('Phase 1');
    }
  }

  async testClientConnection() {
    try {
      // Initialize the client and verify it can communicate with the server
      const initResult = await this.client.initialize();
      
      if (initResult && initResult.protocolVersion) {
        this.logger.logTest('Phase 1', 'MCP Client Connection', 'passed', {
          protocolVersion: initResult.protocolVersion,
          serverName: initResult.serverInfo?.name,
          connectionType: 'End-to-end MCP client'
        });
      } else {
        this.logger.logTest('Phase 1', 'MCP Client Connection', 'failed', {
          error: 'Failed to establish MCP client connection'
        });
      }
    } catch (error) {
      this.logger.logTest('Phase 1', 'MCP Client Connection', 'failed', {
        error: error.message
      });
    }
  }
}

module.exports = Phase1ProtocolTests;
