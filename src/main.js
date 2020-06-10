const puppeteer = require('puppeteer')
const fs = require('fs')
const util = require('util')
const path = require('path')
const AWS = require('aws-sdk')
const cheerio  = require('cheerio')

const config = require('./config')

const writeFile = util.promisify(fs.writeFile)

const baseUrl = 'https://www.roguefitness.com/'

module.exports = async function main () {
  try {
    const productsFile = path.resolve(process.cwd(), config.PRODUCT_FILE)
    const memoryFile = path.resolve(process.cwd(), config.MEMORY_FILE)

    const products = require(productsFile)

    let memory
    try { memory = require(memoryFile) } catch (error) { memory = {} }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox']
    })
    const sns = new AWS.SNS({
      credentials: {
        secretAccessKey: config.AWS_SECRET,
        accessKeyId: config.AWS_KEY,
      }, region: 'us-east-1'
    })

    const date = new Date()

    for (const product of products) {
      const key = product.key
      const url = baseUrl + key
      const context = await browser.createIncognitoBrowserContext()
      const page = await context.newPage()
      await page.goto(url, { waitUntil: 'networkidle0' })
      const html = await page.content()
      const $ = cheerio.load(html)

      const items = []
      const title = $('.product-title').text()
      const result = { title, key, items }

      const product_shop = $('.product-shop')
      if ($(product_shop).has('.item-group').length > 0) {
        $(product_shop).find('.item-group .grouped-item').each((_, el) => {
          const name = $(el).find('.item-name').text()
          const price = $(el).find('.price').text()
          const available = $(el).has('.bin-out-of-stock').length === 0
          items.push({ name, price, available })
        })
      } else {
        const price = $(product_shop).find('.price').text()
        const available = $(product_shop).has('.bin-out-of-stock').length === 0
        items.push({ name: title, price, available })
      }

      if (product.filter) {
        result.items = result.items.filter(value => {
          if (typeof product.filter === 'string') {
            return value.name.toLowerCase() === product.filter.toLowerCase()
          } else if (product.filter instanceof RegExp) {
            return product.filter.test(value.name)
          } else if (Array.isArray(product.filter)) {
            for (const filter of product.filter) {
              if (typeof filter === 'string') {
                if (value.name.toLowerCase() === filter.toLowerCase()) return true
              } else if (filter instanceof RegExp) {
                if (filter.test(value.name)) return true
              }
            }
            return false
          }
        })
      }

      for (const item of result.items) {
        const uid = `${result.key}:${item.name}`
        const data = {
          date: date.toISOString(),
          key: product.key,
          available: item.available,
          notified: false,
          price: item.price,
          name: item.name,
        }

        if (memory[uid] === 'available') {
          if (item.available === false) {
            memory[uid] = 'out-of-stock'
            data.notified = true
            await sns.publish({
              Message: `Out of Stock: ${item.name} -> ${url}`,
              TopicArn: 'arn:aws:sns:us-east-1:686117483451:rogue',
            }).promise()
          }
        } else if (item.available === true) {
          memory[uid] = 'available'
          data.notified = true
          await sns.publish({
            Message: `In Stock: ${item.name} -> ${url}`,
            TopicArn: 'arn:aws:sns:us-east-1:686117483451:rogue',
          }).promise()
        } else memory[uid] = 'out-of-stock'

        console.log(JSON.stringify(data))
      }

      await page.close()
      await context.close()
    }

    await browser.close()

    await writeFile('memory.json', JSON.stringify(memory))
  } catch (error) {
    console.log(error)
  }
}
