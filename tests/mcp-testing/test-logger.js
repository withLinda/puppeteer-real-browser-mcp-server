const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

class TestLogger {
  constructor(logDir = './test-logs') {
    this.logDir = logDir;
    this.currentTestRun = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    this.logFile = path.join(logDir, `test-run-${this.currentTestRun}.log`);
    this.errorFile = path.join(logDir, `errors-${this.currentTestRun}.log`);
    this.jsonFile = path.join(logDir, `results-${this.currentTestRun}.json`);
    
    // Results tracking
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {
        os: process.platform,
        nodeVersion: process.version,
        cwd: process.cwd()
      },
      phases: {},
      summary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: []
      }
    };
    
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    // Console output with color
    const colors = {
      INFO: '\x1b[36m',
      SUCCESS: '\x1b[32m',
      WARNING: '\x1b[33m',
      ERROR: '\x1b[31m',
      DEBUG: '\x1b[90m'
    };
    
    console.log(`${colors[level] || ''}${logEntry}\x1b[0m`);
    
    // File output
    fs.appendFileSync(this.logFile, logEntry);
    
    // Also log errors to separate error file
    if (level === 'ERROR') {
      fs.appendFileSync(this.errorFile, logEntry);
      this.results.summary.errors.push({
        timestamp,
        message
      });
    }
  }

  startPhase(phaseName, description) {
    this.log(`\\n${'='.repeat(80)}`);
    this.log(`STARTING PHASE: ${phaseName}`);
    this.log(`Description: ${description}`);
    this.log(`${'='.repeat(80)}\\n`);
    
    this.results.phases[phaseName] = {
      name: phaseName,
      description,
      startTime: new Date().toISOString(),
      tests: [],
      summary: { passed: 0, failed: 0, skipped: 0 }
    };
  }

  endPhase(phaseName) {
    const phase = this.results.phases[phaseName];
    if (phase) {
      phase.endTime = new Date().toISOString();
      phase.duration = new Date(phase.endTime) - new Date(phase.startTime);
      
      this.log(`\\n${'='.repeat(80)}`);
      this.log(`PHASE COMPLETE: ${phaseName}`);
      this.log(`Duration: ${phase.duration}ms`);
      this.log(`Results: ${phase.summary.passed} passed, ${phase.summary.failed} failed, ${phase.summary.skipped} skipped`);
      this.log(`${'='.repeat(80)}\\n`);
    }
  }

  logTest(phaseName, testName, result, details = {}) {
    const phase = this.results.phases[phaseName];
    if (!phase) return;
    
    const test = {
      name: testName,
      result,
      timestamp: new Date().toISOString(),
      ...details
    };
    
    phase.tests.push(test);
    phase.summary[result]++;
    this.results.summary[result]++;
    this.results.summary.totalTests++;
    
    const icon = {
      passed: '✅',
      failed: '❌',
      skipped: '⏭️'
    };
    
    this.log(`${icon[result] || '❓'} Test: ${testName} - ${result.toUpperCase()}`, 
             result === 'passed' ? 'SUCCESS' : result === 'failed' ? 'ERROR' : 'WARNING');
    
    if (details.error) {
      this.log(`   Error: ${details.error}`, 'ERROR');
    }
    
    if (details.retries) {
      this.log(`   Retries: ${details.retries}`, 'WARNING');
    }
  }

  saveResults() {
    fs.writeFileSync(this.jsonFile, JSON.stringify(this.results, null, 2));
    this.log(`Results saved to: ${this.jsonFile}`, 'INFO');
    
    // Generate summary report
    this.generateSummaryReport();
  }

  generateSummaryReport() {
    const summaryFile = path.join(this.logDir, `summary-${this.currentTestRun}.md`);
    
    let report = `# Test Execution Report - ${this.currentTestRun}\\n\\n`;
    report += `## Environment\\n`;
    report += `- OS: ${this.results.environment.os}\\n`;
    report += `- Node.js: ${this.results.environment.nodeVersion}\\n`;
    report += `- Directory: ${this.results.environment.cwd}\\n\\n`;
    
    report += `## Summary\\n`;
    report += `- Total Tests: ${this.results.summary.totalTests}\\n`;
    report += `- ✅ Passed: ${this.results.summary.passed}\\n`;
    report += `- ❌ Failed: ${this.results.summary.failed}\\n`;
    report += `- ⏭️ Skipped: ${this.results.summary.skipped}\\n\\n`;
    
    if (this.results.summary.errors.length > 0) {
      report += `## Errors\\n`;
      this.results.summary.errors.forEach(error => {
        report += `- [${error.timestamp}] ${error.message}\\n`;
      });
      report += `\\n`;
    }
    
    report += `## Phase Results\\n`;
    Object.values(this.results.phases).forEach(phase => {
      report += `\\n### ${phase.name}\\n`;
      report += `- Duration: ${phase.duration || 'N/A'}ms\\n`;
      report += `- Results: ${phase.summary.passed}/${phase.tests.length} passed\\n`;
      
      if (phase.tests.some(t => t.result === 'failed')) {
        report += `\\n#### Failed Tests:\\n`;
        phase.tests.filter(t => t.result === 'failed').forEach(test => {
          report += `- ${test.name}: ${test.error || 'Unknown error'}\\n`;
        });
      }
    });
    
    fs.writeFileSync(summaryFile, report);
    this.log(`Summary report saved to: ${summaryFile}`, 'INFO');
  }
}

module.exports = TestLogger;