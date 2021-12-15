import { Client, Intents, MessageEmbed } from 'discord.js';
import * as env from 'dotenv';
import cron from 'node-cron';
import axios from 'axios';
import * as fs from 'fs';
import JSDOM from 'jsdom';

env.config();

const url = 'https://www.njportal.com/NJSP/NicsVerification';
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
// 10 8 * * 1-6
cron.schedule('* * * * 1-6', async () => {
    const webhookURL = process.env.WEBHOOKURL;

    const time = new Date();
    const formattedTime =
        time.getMonth() +
        1 +
        '-' +
        time.getDate() +
        '-' +
        time.getFullYear() +
        '-' +
        time.getHours();

    const timeMinute =
        time.getMinutes() - 10 >= 0
            ? time.getMinutes()
            : '0' + time.getMinutes();
    const amOrPm = time.getHours() > 12 ? 'am' : 'pm';
    const hours =
        time.getHours() - 12 > 0 ? time.getHours() - 12 : time.getHours();
    const fetchedTime = `${hours}:${timeMinute} ${amOrPm}`;

    const request = await axios.get(url);
    await saveData(request.data, formattedTime);
    fs.readFile(
        `queue/${formattedTime}-nics.html`,
        { encoding: 'utf8' },
        (error, data) => {
            if (error) {
                return console.error(error);
            }
            const dom = new JSDOM.JSDOM(data);
            const message =
                dom.window.document.querySelector(
                    'div.message-group',
                ).innerHTML;

            embedMessage(message, webhookURL, fetchedTime);
        },
    );
});

/**
 * Saves NJNics portal page
 * @param {string} data HTML file retrieved from NJNics
 * @param {string} time Current date object
 */
async function saveData(data: string, time: string) {
    try {
        fs.writeFile(`queue/${time}-nics.html`, data, { flag: 'w+' }, (err) => {
            if (err) {
                console.error(err);
            }
            console.log('file saved');
        });
    } catch (error) {
        console.error(error);
    }
}

/**
 * Sends embedded message to channel
 * @param {string} message message to post to channel
 * @param {string} webHookURL webhook url
 * @param {string} fetchedTime time when data was fetched
 */
async function embedMessage(
    message: string,
    webHookURL: string,
    fetchedTime: string,
) {
    const embed = new MessageEmbed();
    embed.setTitle('NJ NICS Queue');
    embed.setURL(url);

    if (message.length > 0) {
        // const time = message.match('.*?[2][0][2][0-9]');

        embed.setDescription(message);
        embed.setFooter(`Fetched at: ${fetchedTime}`);
        embed.setColor('#ffd81e');

        const body = {
            content: '',
            embeds: [embed],
            avatar_url:
                'https://www.njportal.com/NJSP/NicsVerification/Images/logo.png',
        };
        await axios.post(webHookURL, body);
    } else {
        embed.setDescription('No updates today');
        const body = { content: '', embeds: [embed] };
        await axios.post(webHookURL, body);
    }
}

client.login(process.env.DISCORD_TOKEN);
