const path = require('node:path');

module.exports = {
  apps: [{
    name: 'makeupkhoj-web',
    cwd: path.join(__dirname, 'website'),
    script: path.join(__dirname, 'website', 'node_modules', 'next', 'dist', 'bin', 'next'),
    interpreter: process.execPath,
    args: ['start', '--port', '7857', '--hostname', '0.0.0.0'],
    exec_mode: 'fork',
    instances: 1,
    watch: false,
    autorestart: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000,
    time: true,
    env: {
      NODE_ENV: 'production',
      PORT: '7857',
      NEXT_BUILD_DIR: '.next',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  }],
};
