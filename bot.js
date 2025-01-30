const { Telegraf } = require('telegraf');
const axios = require('axios');

// Конфигурация
const BOT_TOKEN = '7764741139:AAFkZc2knTG09b9L8fE0n1vQFV18LrEv-4s'; // Токен Telegram-бота
const API_URL = 'https://toncenter.com/api/v2/getTransactions';
const API_KEY = '37545bf70228deb89f50340e2f362d41f61ec3b2e46c17c9ff2cf21f23dde56c'; // API-ключ Toncenter
const TONAPI_URL = 'https://tonapi.io/v2/events/'; // API Tonapi для получения данных по хэшу
const ADDRESS = 'EQCD9h3nwvP4vZYL0nx2bhlEnRaxRCjaOwKMiDwymBpZWSKi'; // Адрес пула или кошелька

const bot = new Telegraf(BOT_TOKEN);
let processedLTs = new Set(); // Храним обработанные LT

const sleep = (n) => new Promise(resolve => setTimeout(resolve, n * 1000));

// Функция для получения транзакций
async function getTransactions(address, limit = 20) {
    try {
        await sleep(1);

        const response = await axios.get(API_URL, {
            params: {
                address: address,
                limit: limit,
                api_key: API_KEY,
            },
        });
        return response.data.result;
    } catch (error) {
        console.error('❌ Ошибка получения транзакций:', error.response?.data || error.message);
        return [];
    }
}

// Функция для получения данных по хэшу через Tonapi
async function getTransactionDetails(hash) {
    try {
        const response = await axios.get(`${TONAPI_URL}${hash}`);
        console.log(`✅ JSON-ответ от Tonapi для хэша ${hash}:`, response.data);
        const action = (response.data.actions || []).find(({ type }) => type === 'JettonSwap');

        if (!action) {
            throw "Action now found";
        }

        const swap = action["JettonSwap"];

        const { symbol, decimals } = swap["jetton_master_out"];

        const value = swap.amount_out * Math.pow(10, -1 * decimals);

        if (symbol === 'pTON' || symbol === 'TON') {
            return { type: 'sell', value, data: response.data };
        } else if (symbol === 'PX') {
            return { type: 'buy', value, data: response.data };
        } else {
            throw `Unknown symbol ${symbol}`;
        }
    } catch (error) {
        console.error(`❌ Ошибка получения данных для транзакции ${hash}:`, error.message);
        return null;
    }
}

// Функция для фильтрации Swap Tokens
function filterSwaps(transactions) {
    const swaps = [];
    transactions.forEach((tx) => {
        const inMsg = tx.in_msg || {};
        const outMsgs = tx.out_msgs || [];

        if (tx.description && tx.description.includes('Called Contract')) {
            return;
        }

        const inValue = inMsg.value ? parseInt(inMsg.value) / 1e9 : null;

        outMsgs.forEach((outMsg) => {
            const outValue = outMsg.value ? parseInt(outMsg.value) / 1e9 : null;
            if (inValue && outValue) {
                swaps.push({
                    from: `${inValue} TON`,
                    to: `${outValue} TON`,
                    transaction_id: tx.transaction_id.hash,
                    lt: tx.transaction_id.lt, // Logical Time для отслеживания
                });
            }
        });
    });
    return swaps;
}

// Функция для обработки и отправки новых транзакций
async function sendNewTransactions(ctx) {
    try {
        const transactions = await getTransactions(ADDRESS, 50);
        const swaps = filterSwaps(transactions);
        const newSwaps = swaps.filter((swap) => !processedLTs.has(swap.lt));

        if (newSwaps.length > 0) {
            for (const swap of newSwaps) {
                console.log(`🔍 Обрабатываем транзакцию: ${swap.transaction_id}`);

                // Получаем данные по хэшу
                const { type, value, data: eventData } = await getTransactionDetails(swap.transaction_id);

                if (eventData) {
                    const message = `💅💅💅💅Девачбки новая транзакция💅💅💅💅
${type === 'buy' ? '✅📈✅КУПЛЕНО' : '❌📉❌ПРОДАНО'}: ${value.toFixed(2)}PX 

💅💅💅👨‍❤️‍👨💅💅💅
`;

                    await ctx.replyWithMarkdown(message);
                } else {
                    console.log(`⚠️ Нет данных для транзакции: ${swap.transaction_id}`);
                }

                processedLTs.add(swap.lt);
            }
        } else {
            console.log('🚀 Нет новых свопов.');
        }
    } catch (error) {
        console.error('❌ Ошибка обновления транзакций:', error.message);
    }
}

// Обработчик команды /start
bot.start((ctx) => {
    ctx.reply('👋 Привет! Я отслеживаю транзакции Swap Tokens в реальном времени. Ожидайте новых обновлений!');
    setInterval(() => sendNewTransactions(ctx), 10000);
});

// Запуск бота
bot.launch();
console.log('🚀 Бот запущен и отслеживает новые транзакции!');
