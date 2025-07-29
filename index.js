
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
    console.error('Error loading verified users from Firebase:', error);
    return {};
  }
}

async function saveVerifiedUser(userId, userData) {
  try {
    await db.ref(`verified-users/${userId}`).set(userData);
    console.log(`✅ User data saved to Firebase: ${userData.username}`);
  } catch (error) {
    console.error('Error saving verified user to Firebase:', error);
  }
}

async function loadChannelRestrictions() {
  try {
    const snapshot = await db.ref('channel-restrictions').once('value');
    return snapshot.val() || {};
  } catch (error) {
    console.error('Error loading channel restrictions from Firebase:', error);
    return {};
  }
}

async function saveChannelRestriction(command, channelId) {
  try {
    await db.ref(`channel-restrictions/${command}`).set(channelId);
    console.log(`✅ Channel restriction saved to Firebase: ${command} -> ${channelId}`);
  } catch (error) {
    console.error('Error saving channel restriction to Firebase:', error);
  }
}

const commands = [
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
          { name: 'restoreall', value: 'restoreall' }
        ))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel where this command can be used')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('sendverify')
    .setDescription('Send the verification embed (Admin only)')
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

async function sendVerificationEmbed(channel) {
  const verifyEmbed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('Verification Required')
    .setDescription('Click the button below to verify and access the server.')
    .setTimestamp();

  const verifyButton = new ButtonBuilder()
    .setCustomId('verify_click')
    .setLabel('Verify Here')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder()
    .addComponents(verifyButton);

  try {
    await channel.send({ embeds: [verifyEmbed], components: [row] });
    console.log('Verification embed sent successfully');
  } catch (error) {
    console.error('Failed to send verification embed:', error);
  }
}

client.once('ready', async () => {
  console.log(`Bot is online as ${client.user.tag}`);
  console.log('🔥 Connected to Firebase Realtime Database');
  client.user.setActivity('Button Verification System', { type: 'WATCHING' });

  // Send verification embed on startup
  if (verifyChannelId) {
    try {
      const verifyChannel = client.channels.cache.get(verifyChannelId);
      if (verifyChannel) {
        await sendVerificationEmbed(verifyChannel);
      } else {
        console.error('Verify channel not found. Please check VERIFY_CHANNEL_ID.');
      }
    } catch (error) {
      console.error('Error sending verification embed on startup:', error);
    }
  } else {
    console.error('VERIFY_CHANNEL_ID not set in environment variables.');
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
            console.log(`✅ Verified role assigned to ${userTag}`);
          }
        } catch (roleError) {
          console.error('Failed to assign verified role:', roleError);
        }

        await interaction.reply({ 
          content: 'You are now verified!',
          ephemeral: true 
        });

        console.log(`✅ User verified and saved to Firebase: ${userTag} (${userId})`);

      } catch (error) {
        console.error('Error during verification process:', error);
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
    console.error('Error checking channel restrictions:', error);
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
