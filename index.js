import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Collection } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.commands = new Collection();

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!'),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(opt => 
      opt.setName('message')
         .setDescription('The message to send')
         .setRequired(true)
    )
].map(command => command.toJSON());

// Register slash commands
const rest = new REST({ version: '10' }).setToken(token);
(async () => {
  try {
    console.log('🌀 Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();

client.once('ready', () => {
  console.log(`🤖 Bot is online as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ping') {
    await interaction.reply('🏓 Pong!');
  }

  if (commandName === 'say') {
    const message = interaction.options.getString('message');
    await interaction.reply({ content: message, ephemeral: false });
  }
});

client.login(token);
