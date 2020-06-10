const cron = require('node-cron')

const config = require('./config')
const main = require('./main')

cron.schedule(config.CRON_SCHEDULE, main)
