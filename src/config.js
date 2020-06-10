const { EZ } = require('eznv')

const schema = EZ.Schema({
  AWS_KEY: EZ.String(),
  AWS_SECRET: EZ.String(),
  AWS_TOPIC: EZ.String(),
  CRON_SCHEDULE: EZ.String({
    default: '0 * * * * *',
  }),
  PRODUCT_FILE: EZ.String({
    default: 'products',
  }),
  MEMORY_FILE: EZ.String({
    default: 'memory',
  })
})

module.exports = schema.loadSync({})
