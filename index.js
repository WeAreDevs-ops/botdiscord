import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
});

const VERIFIED_USERS_FILE = 'verified-users.json';
const CHANNEL_RESTRICTIONS_FILE = 'channel-restrictions.json';

function loadVerifiedUsers() {
  try {
    if (fs.existsSync(VERIFIED_USERS_FILE)) {
      const data = fs.readFileSync(VERIFIED_USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Error loading verified users:', error);
    return {};
  }
}

function saveVerifiedUsers(users) {
  try {
    fs.writeFileSync(VERIFIED_USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving verified users:', error);
  }
}

function loadChannelRestrictions() {
  try {
    if (fs.existsSync(CHANNEL_RESTRICTIONS_FILE)) {
      const data = fs.readFileSync(CHANNEL_RESTRICTIONS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Error loading channel restrictions:', error);
    return {};
  }
}

function saveChannelRestrictions(restrictions) {
  try {
    fs.writeFileSync(CHANNEL_RESTRICTIONS_FILE, JSON.stringify(restrictions, null, 2));
  } catch (error) {
    console.error('Error saving channel restrictions:', error);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify yourself to be able to restore your account later'),

  new SlashCommandBuilder()
    .setName('restoreall')
    .setDescription('Send restore invites to all verified users (Admin only)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Custom message with invite link to send to verified users')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setcommand')
    .setDescription('Restrict a command to a specific channel (Admin only)')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('The command name to restrict')
        .setRequired(true)
        .addChoices(
          { name: 'verify', value: 'verify' },
          { name: 'restoreall', value: 'restoreall' }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where this command can be used')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Registering global slash commands...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Global slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
})();

client.once('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
  client.user.setActivity('Verification System', { type: 'WATCHING' });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Check channel restrictions
  const channelRestrictions = loadChannelRestrictions();
  if (channelRestrictions[commandName] && channelRestrictions[commandName] !== interaction.channelId) {
    const restrictedChannel = interaction.guild.channels.cache.get(channelRestrictions[commandName]);
    const channelName = restrictedChannel ? restrictedChannel.name : 'unknown';
    
    const restrictionEmbed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚫 Command Restricted')
      .setDescription(`This command can only be used in <#${channelRestrictions[commandName]}> (${channelName})`)
      .setTimestamp();

    return await interaction.reply({ embeds: [restrictionEmbed], ephemeral: true });
  }

  try {
    switch (commandName) {
      case 'verify':
        const verifiedUsers = loadVerifiedUsers();
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const discriminator = interaction.user.discriminator;
        const userTag = discriminator === '0' ? username : `${username}#${discriminator}`;

        if (verifiedUsers[userId]) {
          const alreadyVerifiedEmbed = new EmbedBuilder()
            .setColor('#ffff00')
            .setTitle('🔐 Already Verified')
            .setDescription("You're already verified.")
            .setTimestamp();

          return await interaction.reply({ embeds: [alreadyVerifiedEmbed], ephemeral: true });
        }

        verifiedUsers[userId] = {
          username: userTag,
          timestamp: new Date().toISOString()
        };

        saveVerifiedUsers(verifiedUsers);

        try {
          const member = interaction.guild.members.cache.get(userId);
          if (member && verifiedRoleId) {
            await member.roles.add(verifiedRoleId);
          }
        } catch (roleError) {
          console.error('Failed to assign verified role:', roleError);
        }

        const verifiedEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Verification Complete')
          .setDescription('You are now verified. If anything happens, we can restore you.')
          .addFields(
            { name: 'User', value: userTag, inline: true },
            { name: 'Verified At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [verifiedEmbed] });
        break;

      case 'restoreall':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const customMessage = interaction.options.getString('message');
        const allVerifiedUsers = loadVerifiedUsers();
        const userCount = Object.keys(allVerifiedUsers).length;

        if (userCount === 0) {
          return await interaction.editReply({ content: 'No verified users found.' });
        }

        let successCount = 0;
        let failCount = 0;

        const restoreEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('🔄 Server Restoration')
          .setDescription(customMessage)
          .setTimestamp();

        for (const [userId, userData] of Object.entries(allVerifiedUsers)) {
          try {
            const user = await client.users.fetch(userId);
            await user.send({ embeds: [restoreEmbed] });
            console.log(`✅ Successfully sent restore message to ${userData.username} (${userId})`);
            successCount++;
          } catch (error) {
            console.log(`❌ Failed to send restore message to ${userData.username} (${userId}): ${error.message}`);
            failCount++;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const resultEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔁 Restore Complete')
          .setDescription('Finished sending restore messages to all verified users.')
          .addFields(
            { name: 'Total Users', value: `${userCount}`, inline: true },
            { name: 'Successful', value: `${successCount}`, inline: true },
            { name: 'Failed', value: `${failCount}`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed] });
        break;

      case 'setcommand':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const commandToRestrict = interaction.options.getString('command');
        const restrictedChannel = interaction.options.getChannel('channel');

        const restrictions = loadChannelRestrictions();
        restrictions[commandToRestrict] = restrictedChannel.id;
        saveChannelRestrictions(restrictions);

        const setCommandEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('⚙️ Command Restriction Set')
          .setDescription(`The \`/${commandToRestrict}\` command can now only be used in <#${restrictedChannel.id}>`)
          .addFields(
            { name: 'Command', value: `/${commandToRestrict}`, inline: true },
            { name: 'Restricted Channel', value: `<#${restrictedChannel.id}>`, inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [setCommandEmbed], ephemeral: true });
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'An error occurred while executing the command.' });
    }
  }
});

client.login(token);