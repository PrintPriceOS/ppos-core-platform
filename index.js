const strategy = require('./packages/strategy');
const orchestration = require('./packages/orchestration');

module.exports = {
    ...strategy,
    ...orchestration
};
