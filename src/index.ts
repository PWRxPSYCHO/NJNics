import { Client, Colors, EmbedFooterOptions } from 'discord.js';
import * as env from 'dotenv';
import cron from 'node-cron';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import JSDOM from 'jsdom';
import { EmbedBuilder } from '@discordjs/builders';

env.config();

const url = 'https://www.njportal.com/NJSP/NicsVerification';
const minuteInterval = 10;
const hourInterval = 1;
const folderPath = process.env.FOLDER_PATH;
let posted = false;
const client = new Client({
    intents: [],
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


// at minute 0 of hour 0 from Mon-Fri
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

// At every 10th minute past every hour from 8 through 17 on every day-of-week from Monday through Friday.
cron.schedule(`*/${minuteInterval} 8-17 * * 1-5`, async () => {
    const time = new Date();

    console.log(`Is today not a holiday: ${!isHoliday(holidays)}`);
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
                    verifyChanges(msg);
                }
            },
        );
    }
    if (!posted && isHoliday(holidays)) {
        embedMessage(
            'Gov holiday no NICS today',
            process.env.WEBHOOKURL,
            time,
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
 * @param {Date} timeFetched time when data was fetched
 */
async function embedMessage(
    message: string,
    webHookURL: string,
    timeFetched: Date,
) {
    const embed = new EmbedBuilder();
    embed.setTitle('NJ NICS Queue');
    embed.setURL(url);

    embed.setDescription(message);
    embed.setFooter({ text: timeFetched.toISOString() } as EmbedFooterOptions);
    embed.setColor(Colors.Yellow);

    const body = {
        content: '',
        embeds: [embed],
    };
    await axios.post(webHookURL, body);
}

/**
 * @param {string} message NICS Queue message
 */
async function verifyChanges(
    message: string,
): Promise<void> {
    const time = new Date();


    console.log(`Formatted Time: ${getPrevTimeInterval(time)}`);
    console.log(`posted: ${posted}`);
    console.log(`Message has val: ${message.length > 0}`);
    fs.readFile(
        `${folderPath}${getPrevTimeInterval(time)}-nics.html`,
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
                    embedMessage(message, process.env.WEBHOOKURL, time);
                    posted = true;
                }
                if (nics === message) {
                    return;
                } else {
                    console.log('Posting Updated Message');
                    embedMessage(message, process.env.WEBHOOKURL, time);
                }
            } else if (message !== null && !posted) {
                console.log('Posting inital message');
                embedMessage(message, process.env.WEBHOOKURL, time);
                posted = true;
            }
        },
    );
}

/**
 * Determines if today is a holiday
 * @return {boolean} if today is a holiday
 * @param {string[]} holidayList List of holidays for the year
 */
function isHoliday(holidayList: string[]): boolean {
    const time = new Date();
    const date = time.getDate() < 10 ? '0' + time.getDate() : time.getDate();
    const today = time.getMonth() + 1 + '/' + date;
    const match = holidayList.find((x) => x === today);

    return match === undefined ? false : true;
}

/**
 * Accepts current date object and returns previous time interval
 * @param {Date} time current date object
 * @return {string} formatted date string
 */
function getPrevTimeInterval(time: Date): string {
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
    return (
        time.getMonth() +
        1 +
        '-' +
        time.getDate() +
        '-' +
        time.getFullYear() +
        '-' +
        hours +
        '-' +
        minutes);

}

const holidays = [
    '1/01',
    '1/17',
    '2/21',
    '4/15',
    '5/30',
    '6/20',
    '7/04',
    '9/05',
    '10/10',
    '11/11',
    '11/24',
    '12/26',
    '12/31',
];

client.login(process.env.DISCORD_TOKEN);
