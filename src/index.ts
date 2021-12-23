import { Client, Intents, MessageEmbed } from 'discord.js';
import * as env from 'dotenv';
import cron from 'node-cron';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import JSDOM from 'jsdom';

env.config();

const url = 'https://www.njportal.com/NJSP/NicsVerification';
const minuteInterval = 10;
const hourInterval = 1;
const folderPath = process.env.FOLDER_PATH;
let posted = false;
const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

client.once('ready', async () => {
    console.log('ready');
});

client.once('shardReconnecting', (id) => {
    console.log(`Shard with ID ${id} reconnected`);
});

client.once('shardDisconnect', (event, shardID) => {
    console.log(`Disconnected from event ${event} with ID ${shardID}`);
});

cron.schedule('0 10,17 * * 1-5', async () => {
    const time = new Date();
    if (!posted && !isHoliday(holidays)) {
        embedMessage(
            'No NICS update at this time',
            process.env.WEBHOOKURL,
            fetchedTime(time),
        );
    }
});
cron.schedule('0 0 * * 1-5', async () => {
    posted = false;
    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error(err);
        }
        for (const file of files) {
            if (file.endsWith('.html')) {
                const sanitizedFile = file.replace(/\//g, '\\\\');
                fs.unlink(path.join(folderPath, sanitizedFile), (error) => {
                    if (error) {
                        console.error(error);
                    }
                });
            }
        }
    });
});
// At every 10th minute past every hour from 8 through 10 on every day-of-week from Monday through Friday.
cron.schedule(`*/${minuteInterval} 8-15 * * 1-5`, async () => {
    const time = new Date();

    if (!isHoliday(holidays)) {
        const formattedTime =
            time.getMonth() +
            1 +
            '-' +
            time.getDate() +
            '-' +
            time.getFullYear() +
            '-' +
            time.getHours() +
            '-' +
            time.getMinutes();

        const request = await axios.get(url);
        await saveData(request.data, formattedTime);
        fs.readFile(
            `${folderPath}${formattedTime}-nics.html`,
            { encoding: 'utf8' },
            (error, data) => {
                if (error) {
                    return console.error(error);
                }
                const dom = new JSDOM.JSDOM(data);
                const message =
                    dom.window.document.querySelector('div.message-group');

                if (message !== null) {
                    const msg = message.innerHTML;
                    verifyChanges(msg, fetchedTime(time));
                }
            },
        );
    }
    if (!posted && isHoliday(holidays)) {
        embedMessage(
            'Gov holiday. No NICS today',
            process.env.WEBHOOKURL,
            fetchedTime(time),
        );
        posted = true;
    }
});

/**
 * Saves html of NJNics portal page
 * @param {string} data HTML file retrieved from NJNics
 * @param {string} time Current date object
 */
async function saveData(data: string, time: string) {
    try {
        fs.writeFile(
            `${folderPath}${time}-nics.html`,
            data,
            { flag: 'w+' },
            (err) => {
                if (err) {
                    console.error(err);
                }
                console.log('file saved');
            },
        );
    } catch (error) {
        console.error(error);
    }
}

/**
 * Sends embedded message to channel
 * @param {string} message message to post to channel
 * @param {string} webHookURL webhook url
 * @param {string} timeFetched time when data was fetched
 */
async function embedMessage(
    message: string,
    webHookURL: string,
    timeFetched: string,
) {
    const embed = new MessageEmbed();
    embed.setTitle('NJ NICS Queue');
    embed.setURL(url);

    // const time = message.match('.*?[2][0][2][0-9]');

    embed.setDescription(message);
    embed.setFooter(`Fetched at: ${timeFetched}`);
    embed.setColor('#ffd81e');

    const body = {
        content: '',
        embeds: [embed],
    };
    await axios.post(webHookURL, body);
}

/**
 * @param {string} message NICS Queue message
 * @param {string} timeFetched when the update was fetched
 */
async function verifyChanges(
    message: string,
    timeFetched: string,
): Promise<void> {
    const time = new Date();

    // Determines if it is at the beginning of the 10 min interval (Otherwise get previous page)
    let minutes =
        time.getMinutes() - minuteInterval >= 0
            ? time.getMinutes() - minuteInterval
            : time.getMinutes();

    // Determines if it is at the beginnning of the hour (Otherwise get previous page)
    let hours = time.getHours();
    if (minutes === 0 && hours / hourInterval !== 8) {
        hours = hours - 1;
        minutes = 50;
    }

    const formattedTime =
        time.getMonth() +
        1 +
        '-' +
        time.getDate() +
        '-' +
        time.getFullYear() +
        '-' +
        hours +
        '-' +
        minutes;

    console.log(`Formatted Time: ${formattedTime}`);
    console.log(`posted: ${posted}`);
    console.log(`Message has val: ${message.length > 0}`);
    fs.readFile(
        `${folderPath}${formattedTime}-nics.html`,
        { encoding: 'utf8' },
        (error, data) => {
            if (error) {
                console.error(error);
            }
            const dom = new JSDOM.JSDOM(data);
            const msg = dom.window.document.querySelector('div.message-group');
            if (msg !== null) {
                const nics = msg.innerHTML;
                console.log(`msg has val: ${nics.length > 0}`);
                if (!posted) {
                    console.log('Posting Message');
                    embedMessage(message, process.env.WEBHOOKURL, timeFetched);
                    posted = true;
                }
                if (nics === message) {
                    return;
                } else {
                    console.log('Posting Updated Message');
                    embedMessage(message, process.env.WEBHOOKURL, timeFetched);
                }
            } else if (message !== null && !posted) {
                console.log('Posting inital message');
                embedMessage(message, process.env.WEBHOOKURL, timeFetched);
                posted = true;
            }
        },
    );
}

/**
 * Determines if today is a holiday
 * @return {boolean} if today is a holiday
 * @param {string[]} holidays List of holidays for the year
 */
function isHoliday(holidays: string[]): boolean {
    const time = new Date();
    const today = time.getMonth() + 1 + '/' + time.getDay();
    const match = holidays.find((x) => x === today);

    return match != null ? true : false;
}

/**
 * Formats date and returns string
 * @param {date} time current date object
 * @return {string} fetchedTime in string format (12hr am/pm)
 */
function fetchedTime(time: Date): string {
    const timeMinute =
        time.getMinutes() - 10 >= 0
            ? time.getMinutes()
            : '0' + time.getMinutes();
    const amOrPm = time.getHours() >= 12 ? 'pm' : 'am';
    const hours =
        time.getHours() - 12 > 0 ? time.getHours() - 12 : time.getHours();
    return `${hours}:${timeMinute} ${amOrPm}`;
}

const holidays = [
    '01/01',
    '01/18',
    '02/15',
    '04/02',
    '05/31',
    '06/18',
    '07/05',
    '09/06',
    '10/11',
    '11/02',
    '11/11',
    '11/25',
    '12/24',
    '12/31',
];

client.login(process.env.DISCORD_TOKEN);
