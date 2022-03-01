const puppeteer = require("puppeteer");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const nodemon = require("nodemon");
const { MongoClient } = require("mongodb");
const client = new MongoClient(
  "mongodb+srv://n_smith:FtJiLp@cluster0.8vmvy.mongodb.net/orderParser?retryWrites=true&w=majority"
);

const { Telegraf } = require("telegraf");

const site = "http://publication.pravo.gov.ru/SignatoryAuthority/president";
const token = "5128264609:AAGsl28EfKtQjX4RXgpLFxIVdIbcKgJ0lB8";

async function app() {
  const bot = new Telegraf(token);
  bot.launch();
  await client.connect();

  const users = await client.db().collection("Users");
  // const usersLength = await users.countDocuments();
  //   console.log(usersLength);

  // Enable graceful stop
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  async function start() {
    try {
      console.log("it's working");

      // await client.connect();

      // await client.db().createCollection("presidentOrders");
      const presidentOrders = await client.db().collection("presidentOrders");
      const presidentOrdersLength = await presidentOrders.countDocuments();
      //   console.log(presidentOrdersLength);

      // Запускаем puppeteer, открываем страницу получаем сырой документ
      // const browser = await puppeteer.launch();
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
      });

      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(0);

      await page.goto(site);

      let content = await page.content();
      await page.waitForSelector(".table.resultlist");
      // await browser.close();

      //Формируем DOM, получаем возможность обращаться к элементам страницы с помощью методов DOM
      const { document } = new JSDOM(content).window;

      //
      let freshOrders = [];
      let table = document.querySelector(".table.resultlist");
      let orders = table.querySelectorAll(".tr");

      // Пишем функция для нахождения даты в указе и ее трансформации
      function timeFormatting(item) {
        let innerSpans = item.querySelectorAll("span");
        let textSpan = innerSpans[innerSpans.length - 1].textContent;
        let editTextSpan = textSpan.split(".").reverse().join("-");
        return Date.parse(editTextSpan);
      }

      function humanDate(item) {
        let innerSpans = item.querySelectorAll("span");
        let textSpan = innerSpans[innerSpans.length - 1].textContent;
        return textSpan;
      }

      // Определяем дату последнего документа
      let lastDate = timeFormatting(orders[0]);

      // await presidentOrders.insertOne({
      //   test: "it works",
      //   time: `${new Date()}`,
      // });

      // Обработчик всех нормативных актов на последнюю дату. Занесение их в массив
      function findAllOrders() {
        for (let i = 0; i < orders.length; i++) {
          let item = orders[i];

          let orderName = item.childNodes[5].childNodes[1].textContent;
          let publishDate = timeFormatting(item);
          let link = item.childNodes[5]
            .querySelectorAll("span")[0]
            .querySelector("a")
            .getAttribute("href");

          let formattedDate = function () {
            let innerSpans = item.querySelectorAll("span");
            let textSpan = innerSpans[innerSpans.length - 1].textContent;
            return textSpan;
          };

          if (publishDate !== lastDate) {
            break;
          } else {
            let order = {
              name: orderName,
              date: publishDate,
              formattedDate: formattedDate(),
              link: `http://publication.pravo.gov.ru${link}`,
              ID: i,
            };

            freshOrders.push(order);
          }
        }
      }

      findAllOrders();

      for (let i = 0; i < freshOrders.length; i++) {
        if (
          !(await presidentOrders.findOne({
            title: `${freshOrders[i].name}`,
          }))
        ) {
          await presidentOrders.insertOne({
            title: `${freshOrders[i].name}`,
            date: `${freshOrders[i].date}`,
            link: `${freshOrders[i].link}`,
          });
          await users.find().forEach((user) =>
            bot.telegram.sendMessage(
              user.telegram_id,
              `<b>Название:</b>
${freshOrders[i].name}
<b>Дата:</b> ${humanDate(orders[0])}

<a href="${freshOrders[i].link}">Смотреть</a>
`,
              { parse_mode: "HTML" }
            )
          );
        }
        // console.log(usersLength);
      }

      bot.start(async (ctx) => {
        console.log(ctx.update.message.chat.id);
        console.log(ctx.update);

        ctx.reply("Добро пожаловать!");

        if (
          !(await users.findOne({
            telegram_id: ctx.update.message.chat.id,
          }))
        ) {
          await users.insertOne({
            telegram_id: ctx.update.message.chat.id,
            first_name: ctx.update.message.chat.first_name,
            last_name: ctx.update.message.chat.last_name,
            username: ctx.update.message.chat.username,
          });
        }

        for (let i = 0; i < freshOrders.length; i++) {
          if (
            !(await presidentOrders.findOne({
              title: `${freshOrders[i].name}`,
            }))
          ) {
            await presidentOrders.insertOne({
              title: `${freshOrders[i].name}`,
              date: `${freshOrders[i].date}`,
              link: `${freshOrders[i].link}`,
            });
            await users.find().forEach((user) =>
              bot.telegram.sendMessage(
                user.telegram_id,
                `<b>Название:</b>
${freshOrders[i].name}
<b>Дата:</b> ${humanDate(orders[0])}

<a href="${freshOrders[i].link}">Смотреть</a>
`,
                { parse_mode: "HTML" }
              )
            );
          }
          // console.log(usersLength);
        }
      });

      bot.help((ctx) => ctx.reply("Send me a sticker"));
      bot.on("sticker", (ctx) => ctx.reply("👍"));

      // bot.launch();
      await browser.close();
      setTimeout(start, 1800000);
    } catch (e) {
      console.log(e);
      setTimeout(start, 1800000);
    }

    // setTimeout(start, 1800000);
  }
  start();
}
app();
