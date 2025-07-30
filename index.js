
import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const verifiedRoleId = process.env.VERIFIED_ROLE_ID;
const verifyChannelId = process.env.VERIFY_CHANNEL_ID;

// Firebase configuration
const firebaseConfig = {
  type: "service_account",
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
});

async function loadVerifiedUsers() {
  try {
    const snapshot = await db.ref('verified-users').once('value');
    return snapshot.val() || {};
  } catch (error) {
    return {};
  }
}

async function saveVerifiedUser(userId, userData) {
  try {
    await db.ref(`verified-users/${userId}`).set(userData);
  } catch (error) {
    // Error saving user data
  }
}

async function loadChannelRestrictions() {
  try {
    const snapshot = await db.ref('channel-restrictions').once('value');
    return snapshot.val() || {};
  } catch (error) {
    return {};
  }
}

async function saveChannelRestriction(command, channelId) {
  try {
    await db.ref(`channel-restrictions/${command}`).set(channelId);
  } catch (error) {
    // Error saving channel restriction
  }
}

async function saveGiveaway(giveawayId, giveawayData) {
  try {
    await db.ref(`giveaways/${giveawayId}`).set(giveawayData);
    console.log(`Saved giveaway to Firebase: ${giveawayId}`);
  } catch (error) {
    console.error(`Error saving giveaway ${giveawayId}:`, error);
  }
}

async function loadGiveaway(giveawayId) {
  try {
    const snapshot = await db.ref(`giveaways/${giveawayId}`).once('value');
    const data = snapshot.val();
    console.log(`Loaded giveaway ${giveawayId}:`, data ? 'Found' : 'Not found');
    return data;
  } catch (error) {
    console.error(`Error loading giveaway ${giveawayId}:`, error);
    return null;
  }
}

function parseDuration(durationStr) {
  const regex = /(\d+)([hdm])/;
  const match = durationStr.match(regex);
  
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  let milliseconds = 0;
  switch (unit) {
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'm':
      milliseconds = value * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
  }
  
  return milliseconds;
}

async function endGiveaway(giveawayId) {
  try {
    console.log(`Attempting to end giveaway: ${giveawayId}`);
    
    const giveawayData = await loadGiveaway(giveawayId);
    if (!giveawayData) {
      console.log(`No giveaway data found for ID: ${giveawayId}`);
      return;
    }
    
    if (!giveawayData.active) {
      console.log(`Giveaway ${giveawayId} is already inactive`);
      return;
    }

    const guild = client.guilds.cache.get(giveawayData.guildId);
    if (!guild) {
      console.log(`Guild not found: ${giveawayData.guildId}`);
      // Mark as inactive even if guild not found
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    const channel = guild.channels.cache.get(giveawayData.channelId);
    if (!channel) {
      console.log(`Channel not found: ${giveawayData.channelId}`);
      // Mark as inactive even if channel not found
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    let message;
    try {
      message = await channel.messages.fetch(giveawayData.messageId);
    } catch (error) {
      console.log(`Failed to fetch message: ${giveawayData.messageId}`);
      // Try to send a fallback message and mark as inactive
      try {
        const fallbackEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🎉 Giveaway Ended')
          .setDescription(`**${giveawayData.title}**\n\nOriginal message not found. Giveaway has ended.`)
          .setFooter({ text: `Giveaway ID: ${giveawayId}` })
          .setTimestamp();

        await channel.send({ embeds: [fallbackEmbed] });
      } catch (sendError) {
        console.log(`Failed to send fallback message: ${sendError}`);
      }
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    const reaction = message.reactions.cache.find(r => {
      // Handle both unicode and custom emojis
      const emojiMatch = r.emoji.name === giveawayData.emoji || 
                        r.emoji.toString() === giveawayData.emoji ||
                        r.emoji.id === giveawayData.emoji;
      return emojiMatch;
    });
    
    if (!reaction) {
      console.log(`No reaction found for emoji: ${giveawayData.emoji}`);
      // Still end the giveaway even if no reactions
      const noReactionEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎉 Giveaway Ended')
        .setDescription(`**${giveawayData.title}**\n\nNo participants found!`)
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      await channel.send({ embeds: [noReactionEmbed] });
      
      // Update original message
      const endedEmbed = new EmbedBuilder()
        .setColor('#808080')
        .setTitle(`🎉 ${giveawayData.title} [ENDED]`)
        .setDescription(giveawayData.description + '\n\n❌ **No participants**\n\n**This giveaway has ended.**')
        .setFooter({ text: `Giveaway ID: ${giveawayId} | Ended` })
        .setTimestamp();

      await message.edit({ embeds: [endedEmbed] });
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
      return;
    }

    console.log(`Found reaction with ${reaction.count} users`);
    const users = await reaction.users.fetch();
    const validParticipants = [];

    for (const [userId, user] of users) {
      if (user.bot) {
        console.log(`Skipping bot user: ${user.username}`);
        continue;
      }

      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (error) {
        console.log(`Failed to fetch member: ${userId}`);
        continue;
      }

      // Check role requirement
      if (giveawayData.requiredRoleId && giveawayData.requiredRoleId !== null && !member.roles.cache.has(giveawayData.requiredRoleId)) {
        console.log(`User ${member.user.username} doesn't have required role`);
        continue;
      }

      validParticipants.push(member);
      console.log(`Added valid participant: ${member.user.username}`);
    }

    console.log(`Found ${validParticipants.length} valid participants out of ${users.size} total reactions`);

    let winners = [];
    let winnerAnnouncement = '';

    if (validParticipants.length === 0) {
      // No valid participants
      winnerAnnouncement = 'No valid participants found!';
      const noWinnerEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🎉 Giveaway Ended')
        .setDescription(`**${giveawayData.title}**\n\n❌ **${winnerAnnouncement}**`)
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      await channel.send({ embeds: [noWinnerEmbed] });
    } else {
      // Select winners
      const numWinners = Math.min(giveawayData.winners, validParticipants.length);
      
      // Better random selection
      for (let i = 0; i < numWinners; i++) {
        const randomIndex = Math.floor(Math.random() * validParticipants.length);
        winners.push(validParticipants.splice(randomIndex, 1)[0]);
      }

      const winnersList = winners.map(w => `<@${w.id}>`).join(', ');
      winnerAnnouncement = `🏆 **Winner(s):** ${winnersList}`;

      const winnerEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 Giveaway Ended - Congratulations!')
        .setDescription(`**${giveawayData.title}**\n\n${winnerAnnouncement}`)
        .addFields({ name: 'Total Participants', value: `${validParticipants.length + winners.length}`, inline: true })
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      await channel.send({ embeds: [winnerEmbed] });
      console.log(`Announced ${winners.length} winner(s): ${winners.map(w => w.user.username).join(', ')}`);

      // Try to DM winners
      for (const winner of winners) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎉 Congratulations!')
            .setDescription(`You won the giveaway: **${giveawayData.title}** in ${guild.name}!\n\nPlease contact the server administrators to claim your prize.`)
            .setTimestamp();

          await winner.send({ embeds: [dmEmbed] });
          console.log(`Successfully DMed winner: ${winner.user.username}`);
        } catch (error) {
          console.log(`Failed to DM winner ${winner.user.username}: ${error.message}`);
        }
      }
    }

    // Update original message with results
    const winnerText = winners.length > 0 ? `\n\n${winnerAnnouncement}` : `\n\n❌ **${winnerAnnouncement}**`;
    
    const endedEmbed = new EmbedBuilder()
      .setColor(winners.length > 0 ? '#00FF00' : '#FF0000')
      .setTitle(`🎉 ${giveawayData.title} [ENDED]`)
      .setDescription(giveawayData.description + winnerText + '\n\n**This giveaway has ended.**')
      .setFooter({ text: `Giveaway ID: ${giveawayId} | Ended` })
      .setTimestamp();

    await message.edit({ embeds: [endedEmbed] });

    // Mark as inactive in Firebase and save winner data
    await db.ref(`giveaways/${giveawayId}`).update({
      active: false,
      endedAt: new Date().toISOString(),
      winners: winners.map(w => ({ id: w.id, username: w.user.username }))
    });
    
    console.log(`Successfully ended giveaway: ${giveawayId} with ${winners.length} winners`);

  } catch (error) {
    console.error(`Error ending giveaway ${giveawayId}:`, error);
    // Try to mark as inactive even on error
    try {
      await db.ref(`giveaways/${giveawayId}/active`).set(false);
    } catch (dbError) {
      console.error(`Failed to mark giveaway as inactive: ${dbError}`);
    }
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('restoreall')
    .setDescription('Send restore invites to all verified users (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Custom message with invite link to send to verified users')
        .setRequired(true))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('setcommand')
    .setDescription('Restrict a command to a specific channel (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('command')
        .setDescription('The command name to restrict')
        .setRequired(true)
        .addChoices(
          { name: 'restoreall', value: 'restoreall' },
          { name: 'sendverify', value: 'sendverify' },
          { name: 'cgiveaway', value: 'cgiveaway' }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where this command can be used')
        .setRequired(true))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('sendverify')
    .setDescription('Send the verification embed (Owner/Admin only)')
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('cgiveaway')
    .setDescription('Create a giveaway with emoji reactions (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Giveaway title')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Giveaway description')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration (e.g., 1h, 30m, 2d)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('emoji')
        .setDescription('Emoji to react with (default: 🎉)')
        .setRequired(false))
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners (default: 1)')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('requirements')
        .setDescription('Requirements to enter (optional)')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('required_role')
        .setDescription('Required role to enter (optional)')
        .setRequired(false))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('endgiveaway')
    .setDescription('Manually end a giveaway (Owner/Admin only)')
    .addStringOption(option =>
      option.setName('giveaway_id')
        .setDescription('The giveaway ID to end')
        .setRequired(true))
    .setDefaultMemberPermissions(0)
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
  } catch (error) {
    // Failed to register commands
  }
})();

async function sendVerificationEmbed(channel) {
  const verifyEmbed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('Verification Required')
    .setDescription('Click the button below to verify and access the server.')
    .setTimestamp();

  const verifyButton = new ButtonBuilder()
    .setCustomId('verify_click')
    .setLabel('Verify Here')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder()
    .addComponents(verifyButton);

  try {
    await channel.send({ embeds: [verifyEmbed], components: [row] });
  } catch (error) {
    // Failed to send verification embed
  }
}

async function checkExpiredGiveaways() {
  try {
    console.log('Checking for expired giveaways...');
    const snapshot = await db.ref('giveaways').once('value');
    const giveaways = snapshot.val() || {};
    
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [giveawayId, giveawayData] of Object.entries(giveaways)) {
      if (giveawayData.active && giveawayData.endTime <= now) {
        console.log(`Found expired giveaway: ${giveawayId}`);
        await endGiveaway(giveawayId);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`Processed ${expiredCount} expired giveaway(s)`);
    }
  } catch (error) {
    console.error('Error checking expired giveaways:', error);
  }
}

client.once('ready', async () => {
  client.user.setActivity('Button Verification System', { type: 'WATCHING' });

  // Check for expired giveaways on startup
  await checkExpiredGiveaways();

  // Check for expired giveaways every 30 seconds
  setInterval(checkExpiredGiveaways, 30000);

  // Send verification embed on startup
  if (verifyChannelId) {
    try {
      const verifyChannel = client.channels.cache.get(verifyChannelId);
      if (verifyChannel) {
        await sendVerificationEmbed(verifyChannel);
      }
    } catch (error) {
      // Error sending verification embed on startup
    }
  }
});

client.on('guildMemberAdd', async member => {
  try {
    // Check if the user is already verified in Firebase
    const userSnapshot = await db.ref(`verified-users/${member.id}`).once('value');
    
    if (userSnapshot.exists() && verifiedRoleId) {
      // User is verified, restore their role
      try {
        await member.roles.add(verifiedRoleId);
        console.log(`Restored verified role for returning user: ${member.user.username} (${member.id})`);
        
        // Optional: Send a welcome back message to the verify channel
        if (verifyChannelId) {
          const verifyChannel = member.guild.channels.cache.get(verifyChannelId);
          if (verifyChannel) {
            const welcomeBackEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('Welcome Back!')
              .setDescription(`${member.user.username} has rejoined and their verified status has been automatically restored.`)
              .setTimestamp();
            
            await verifyChannel.send({ embeds: [welcomeBackEmbed] });
          }
        }
      } catch (roleError) {
        console.error(`Failed to restore verified role for ${member.user.username}:`, roleError);
      }
    }
  } catch (error) {
    console.error(`Error checking verification status for new member ${member.user.username}:`, error);
  }
});

client.on('interactionCreate', async interaction => {
  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_click') {
      const userId = interaction.user.id;
      const username = interaction.user.username;
      const discriminator = interaction.user.discriminator;
      const userTag = discriminator === '0' ? username : `${username}#${discriminator}`;

      // Check if user is already verified in Firebase
      try {
        const userSnapshot = await db.ref(`verified-users/${userId}`).once('value');
        if (userSnapshot.exists()) {
          return await interaction.reply({ 
            content: 'You are already verified.',
            ephemeral: true 
          });
        }

        // Add user to Firebase
        const userData = {
          username: userTag,
          timestamp: new Date().toISOString()
        };

        await saveVerifiedUser(userId, userData);

        // Assign verified role
        try {
          const member = interaction.guild.members.cache.get(userId);
          if (member && verifiedRoleId) {
            await member.roles.add(verifiedRoleId);
          }
        } catch (roleError) {
          // Failed to assign verified role
        }

        await interaction.reply({ 
          content: 'You are now verified!',
          ephemeral: true 
        });

      } catch (error) {
        await interaction.reply({ 
          content: '❌ An error occurred during verification. Please try again.',
          ephemeral: true 
        });
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Check channel restrictions from Firebase
  try {
    const channelRestrictions = await loadChannelRestrictions();
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
  } catch (error) {
    // Error checking channel restrictions
  }

  try {
    switch (commandName) {
      case 'sendverify':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        await sendVerificationEmbed(interaction.channel);
        await interaction.reply({ 
          content: 'Verification embed sent successfully!',
          ephemeral: true 
        });
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
        const allVerifiedUsers = await loadVerifiedUsers();
        const userCount = Object.keys(allVerifiedUsers).length;

        if (userCount === 0) {
          return await interaction.editReply({ content: 'No verified users found in Firebase.' });
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
            successCount++;
          } catch (error) {
            failCount++;
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const resultEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔁 Restore Complete')
          .setDescription('Finished sending restore messages to all verified users from Firebase.')
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

        await saveChannelRestriction(commandToRestrict, restrictedChannel.id);

        const setCommandEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('⚙️ Command Restriction Set')
          .setDescription(`The \`/${commandToRestrict}\` command can now only be used in <#${restrictedChannel.id}>`)
          .addFields(
            { name: 'Command', value: `/${commandToRestrict}`, inline: true },
            { name: 'Restricted Channel', value: `<#${restrictedChannel.id}>`, inline: true },
            { name: 'Storage', value: 'Firebase Realtime DB', inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [setCommandEmbed], ephemeral: true });
        break;

      case 'cgiveaway':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const durationStr = interaction.options.getString('duration');
        const emoji = interaction.options.getString('emoji') || '🎉';
        const winners = interaction.options.getInteger('winners') || 1;
        const requirements = interaction.options.getString('requirements');
        const requiredRole = interaction.options.getRole('required_role');

        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
          return await interaction.reply({ 
            content: 'Invalid duration format. Use format like: 1h, 30m, 2d', 
            ephemeral: true 
          });
        }

        const endTime = new Date(Date.now() + durationMs);
        const giveawayId = `${interaction.guild.id}-${Date.now()}`;

        let embedDescription = description;
        if (requirements) {
          embedDescription += `\n\n**Requirements:**\n${requirements}`;
        }
        if (requiredRole) {
          embedDescription += `\n**Required Role:** ${requiredRole}`;
        }

        embedDescription += `\n\n**Winners:** ${winners}`;
        embedDescription += `\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:F>`;
        embedDescription += `\n\nReact with ${emoji} to enter!`;

        const giveawayEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(`🎉 ${title}`)
          .setDescription(embedDescription)
          .setFooter({ text: `Giveaway ID: ${giveawayId}` })
          .setTimestamp();

        const giveawayMessage = await interaction.channel.send({ embeds: [giveawayEmbed] });
        await giveawayMessage.react(emoji);

        // Save giveaway data to Firebase
        const giveawayData = {
          messageId: giveawayMessage.id,
          channelId: interaction.channel.id,
          guildId: interaction.guild.id,
          title,
          description,
          emoji,
          winners,
          requirements: requirements || null,
          requiredRoleId: requiredRole?.id || null,
          endTime: endTime.getTime(),
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString(),
          active: true
        };

        try {
          await saveGiveaway(giveawayId, giveawayData);
          console.log(`Created giveaway ${giveawayId}, ends at: ${endTime.toISOString()}`);

          // Don't rely on setTimeout for persistence across restarts
          // The checkExpiredGiveaways function will handle ending expired giveaways

          await interaction.reply({ 
            content: `✅ Giveaway created successfully! ID: ${giveawayId}`,
            ephemeral: true 
          });
        } catch (saveError) {
          console.error(`Failed to save giveaway ${giveawayId}:`, saveError);
          
          // Try to delete the message since giveaway wasn't saved
          try {
            await giveawayMessage.delete();
          } catch (deleteError) {
            console.error('Failed to delete giveaway message:', deleteError);
          }
          
          await interaction.reply({ 
            content: `❌ Failed to create giveaway. Please try again.`,
            ephemeral: true 
          });
        }
        break;

      case 'endgiveaway':
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.guild.ownerId !== interaction.user.id) {
          return await interaction.reply({ 
            content: 'You need Administrator permission or be the server owner to use this command.', 
            ephemeral: true 
          });
        }

        const giveawayIdToEnd = interaction.options.getString('giveaway_id');
        
        // Check if giveaway exists
        const giveawayToEnd = await loadGiveaway(giveawayIdToEnd);
        if (!giveawayToEnd) {
          return await interaction.reply({ 
            content: `❌ Giveaway with ID \`${giveawayIdToEnd}\` not found.`, 
            ephemeral: true 
          });
        }

        if (!giveawayToEnd.active) {
          return await interaction.reply({ 
            content: `❌ Giveaway \`${giveawayIdToEnd}\` has already ended.`, 
            ephemeral: true 
          });
        }

        await interaction.deferReply({ ephemeral: true });
        
        await endGiveaway(giveawayIdToEnd);
        
        await interaction.editReply({ 
          content: `✅ Successfully ended giveaway: \`${giveawayIdToEnd}\`` 
        });
        break;
    }
  } catch (error) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
    } else if (interaction.deferred) {
      await interaction.editReply({ content: 'An error occurred while executing the command.' });
    }
  }
});

client.login(token);
