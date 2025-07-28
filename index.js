
import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  Collection,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration
  ],
});

client.commands = new Collection();

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for kick')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for ban')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('days')
        .setDescription('Days of messages to delete (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server')
    .addStringOption(option =>
      option.setName('userid')
        .setDescription('User ID to unban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unban')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to timeout')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('duration')
        .setDescription('Duration in minutes')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for timeout')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a member')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to remove timeout from')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for removing timeout')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for warning')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete messages from a channel')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Only delete messages from this user')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to lock (current channel if not specified)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for locking')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to unlock (current channel if not specified)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for unlocking')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set channel slowmode')
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Slowmode duration in seconds (0 to disable)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to modify (current channel if not specified)')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get information about a user')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to get info about')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get server information'),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Get user avatar')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to get avatar from')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Manage user roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a role to a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to add role to')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to add')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to remove role from')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to remove')
            .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
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
  client.user.setActivity('Managing server', { type: 'WATCHING' });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'ping':
        const ping = Date.now() - interaction.createdTimestamp;
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🏓 Pong!')
          .addFields(
            { name: 'Latency', value: `${ping}ms`, inline: true },
            { name: 'API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
          )
          .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        break;

      case 'kick':
        const kickUser = interaction.options.getUser('user');
        const kickReason = interaction.options.getString('reason') || 'No reason provided';
        const kickMember = interaction.guild.members.cache.get(kickUser.id);

        if (!kickMember) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        if (!kickMember.kickable) {
          return interaction.reply({ content: 'Cannot kick this user.', ephemeral: true });
        }

        try {
          await kickMember.kick(kickReason);
          const kickEmbed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('Member Kicked')
            .addFields(
              { name: 'User', value: `${kickUser.tag}`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: kickReason }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [kickEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to kick user.', ephemeral: true });
        }
        break;

      case 'ban':
        const banUser = interaction.options.getUser('user');
        const banReason = interaction.options.getString('reason') || 'No reason provided';
        const banDays = interaction.options.getInteger('days') || 0;
        const banMember = interaction.guild.members.cache.get(banUser.id);

        if (banMember && !banMember.bannable) {
          return interaction.reply({ content: 'Cannot ban this user.', ephemeral: true });
        }

        try {
          await interaction.guild.bans.create(banUser.id, { reason: banReason, deleteMessageDays: banDays });
          const banEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Member Banned')
            .addFields(
              { name: 'User', value: `${banUser.tag}`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: banReason },
              { name: 'Messages Deleted', value: `${banDays} days` }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [banEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to ban user.', ephemeral: true });
        }
        break;

      case 'unban':
        const unbanUserId = interaction.options.getString('userid');
        const unbanReason = interaction.options.getString('reason') || 'No reason provided';

        try {
          await interaction.guild.bans.remove(unbanUserId, unbanReason);
          const unbanEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('User Unbanned')
            .addFields(
              { name: 'User ID', value: unbanUserId, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: unbanReason }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [unbanEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to unban user. Make sure the user ID is correct and the user is banned.', ephemeral: true });
        }
        break;

      case 'timeout':
        const timeoutUser = interaction.options.getUser('user');
        const timeoutDuration = interaction.options.getInteger('duration');
        const timeoutReason = interaction.options.getString('reason') || 'No reason provided';
        const timeoutMember = interaction.guild.members.cache.get(timeoutUser.id);

        if (!timeoutMember) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        if (!timeoutMember.moderatable) {
          return interaction.reply({ content: 'Cannot timeout this user.', ephemeral: true });
        }

        try {
          await timeoutMember.timeout(timeoutDuration * 60 * 1000, timeoutReason);
          const timeoutEmbed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('Member Timed Out')
            .addFields(
              { name: 'User', value: `${timeoutUser.tag}`, inline: true },
              { name: 'Duration', value: `${timeoutDuration} minutes`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: timeoutReason }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [timeoutEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to timeout user.', ephemeral: true });
        }
        break;

      case 'untimeout':
        const untimeoutUser = interaction.options.getUser('user');
        const untimeoutReason = interaction.options.getString('reason') || 'No reason provided';
        const untimeoutMember = interaction.guild.members.cache.get(untimeoutUser.id);

        if (!untimeoutMember) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        try {
          await untimeoutMember.timeout(null, untimeoutReason);
          const untimeoutEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Timeout Removed')
            .addFields(
              { name: 'User', value: `${untimeoutUser.tag}`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: untimeoutReason }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [untimeoutEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to remove timeout.', ephemeral: true });
        }
        break;

      case 'warn':
        const warnUser = interaction.options.getUser('user');
        const warnReason = interaction.options.getString('reason');
        
        const warnEmbed = new EmbedBuilder()
          .setColor('#ffff00')
          .setTitle('Member Warned')
          .addFields(
            { name: 'User', value: `${warnUser.tag}`, inline: true },
            { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
            { name: 'Reason', value: warnReason }
          )
          .setTimestamp();
        
        try {
          await warnUser.send(`You have been warned in ${interaction.guild.name} for: ${warnReason}`);
        } catch (error) {
          console.log('Could not send DM to user');
        }
        
        await interaction.reply({ embeds: [warnEmbed] });
        break;

      case 'clear':
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

        try {
          const messages = await interaction.channel.messages.fetch({ limit: amount });
          const filteredMessages = targetUser 
            ? messages.filter(msg => msg.author.id === targetUser.id)
            : messages;

          await interaction.channel.bulkDelete(filteredMessages, true);
          
          const clearEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Messages Cleared')
            .addFields(
              { name: 'Amount', value: `${filteredMessages.size}`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Target User', value: targetUser ? targetUser.tag : 'All users', inline: true }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [clearEmbed], ephemeral: true });
        } catch (error) {
          await interaction.reply({ content: 'Failed to clear messages.', ephemeral: true });
        }
        break;

      case 'lock':
        const lockChannel = interaction.options.getChannel('channel') || interaction.channel;
        const lockReason = interaction.options.getString('reason') || 'No reason provided';

        try {
          await lockChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: false
          });
          
          const lockEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('Channel Locked')
            .addFields(
              { name: 'Channel', value: `${lockChannel}`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: lockReason }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [lockEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to lock channel.', ephemeral: true });
        }
        break;

      case 'unlock':
        const unlockChannel = interaction.options.getChannel('channel') || interaction.channel;
        const unlockReason = interaction.options.getString('reason') || 'No reason provided';

        try {
          await unlockChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: null
          });
          
          const unlockEmbed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Channel Unlocked')
            .addFields(
              { name: 'Channel', value: `${unlockChannel}`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
              { name: 'Reason', value: unlockReason }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [unlockEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to unlock channel.', ephemeral: true });
        }
        break;

      case 'slowmode':
        const slowmodeSeconds = interaction.options.getInteger('seconds');
        const slowmodeChannel = interaction.options.getChannel('channel') || interaction.channel;

        try {
          await slowmodeChannel.setRateLimitPerUser(slowmodeSeconds);
          
          const slowmodeEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Slowmode Updated')
            .addFields(
              { name: 'Channel', value: `${slowmodeChannel}`, inline: true },
              { name: 'Duration', value: slowmodeSeconds === 0 ? 'Disabled' : `${slowmodeSeconds} seconds`, inline: true },
              { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
            )
            .setTimestamp();
          
          await interaction.reply({ embeds: [slowmodeEmbed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to set slowmode.', ephemeral: true });
        }
        break;

      case 'userinfo':
        const infoUser = interaction.options.getUser('user') || interaction.user;
        const infoMember = interaction.guild.members.cache.get(infoUser.id);

        const userEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('User Information')
          .setThumbnail(infoUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Username', value: infoUser.tag, inline: true },
            { name: 'ID', value: infoUser.id, inline: true },
            { name: 'Account Created', value: `<t:${Math.floor(infoUser.createdTimestamp / 1000)}:F>`, inline: false }
          );

        if (infoMember) {
          userEmbed.addFields(
            { name: 'Joined Server', value: `<t:${Math.floor(infoMember.joinedTimestamp / 1000)}:F>`, inline: false },
            { name: 'Roles', value: infoMember.roles.cache.map(role => role.toString()).join(' ') || 'None', inline: false }
          );
        }

        await interaction.reply({ embeds: [userEmbed] });
        break;

      case 'serverinfo':
        const guild = interaction.guild;
        
        const serverEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Server Information')
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .addFields(
            { name: 'Server Name', value: guild.name, inline: true },
            { name: 'Server ID', value: guild.id, inline: true },
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: `${guild.memberCount}`, inline: true },
            { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [serverEmbed] });
        break;

      case 'avatar':
        const avatarUser = interaction.options.getUser('user') || interaction.user;
        
        const avatarEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle(`${avatarUser.tag}'s Avatar`)
          .setImage(avatarUser.displayAvatarURL({ dynamic: true, size: 512 }))
          .setTimestamp();

        await interaction.reply({ embeds: [avatarEmbed] });
        break;

      case 'role':
        const subcommand = interaction.options.getSubcommand();
        const roleUser = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const roleMember = interaction.guild.members.cache.get(roleUser.id);

        if (!roleMember) {
          return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        if (subcommand === 'add') {
          if (roleMember.roles.cache.has(role.id)) {
            return interaction.reply({ content: 'User already has this role.', ephemeral: true });
          }

          try {
            await roleMember.roles.add(role);
            const addRoleEmbed = new EmbedBuilder()
              .setColor('#00ff00')
              .setTitle('Role Added')
              .addFields(
                { name: 'User', value: `${roleUser.tag}`, inline: true },
                { name: 'Role', value: `${role}`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
              )
              .setTimestamp();
            await interaction.reply({ embeds: [addRoleEmbed] });
          } catch (error) {
            await interaction.reply({ content: 'Failed to add role.', ephemeral: true });
          }
        } else if (subcommand === 'remove') {
          if (!roleMember.roles.cache.has(role.id)) {
            return interaction.reply({ content: 'User does not have this role.', ephemeral: true });
          }

          try {
            await roleMember.roles.remove(role);
            const removeRoleEmbed = new EmbedBuilder()
              .setColor('#ff0000')
              .setTitle('Role Removed')
              .addFields(
                { name: 'User', value: `${roleUser.tag}`, inline: true },
                { name: 'Role', value: `${role}`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
              )
              .setTimestamp();
            await interaction.reply({ embeds: [removeRoleEmbed] });
          } catch (error) {
            await interaction.reply({ content: 'Failed to remove role.', ephemeral: true });
          }
        }
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
    if (!interaction.replied) {
      await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
    }
  }
});

client.login(token);
