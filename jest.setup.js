// Keep test output readable: silence Nest's logger (warnings are asserted via behaviour, not logs).
const { Logger } = require('@nestjs/common');

Logger.overrideLogger(false);
