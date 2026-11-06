require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes,
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Create a Collection to store commands efficiently
client.commands = new Collection();
const commandsArray = [];

// Dynamically read command files from the /commands folder
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsArray.push(command.data.toJSON());
        console.log(`[LOADER] Loaded command: /${command.data.name}`);
    } else {
        console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Path to store server-specific user info inside a /data folder
const dataDir = path.join(__dirname, 'data');

// Ensure the data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function logUserData(guildId, userData) {
    const guildFilePath = path.join(dataDir, `${guildId}.json`);
    let existingData = [];
    
    if (fs.existsSync(guildFilePath)) {
        try {
            existingData = JSON.parse(fs.readFileSync(guildFilePath, 'utf8'));
        } catch (err) {
            console.error(`Error reading data for guild ${guildId}:`, err);
        }
    }
    
    // Prevent duplicate entries for the same user ID in this server
    const index = existingData.findIndex(u => u.userId === userData.userId);
    if (index !== -1) {
        existingData[index] = userData; // Update timestamp
    } else {
        existingData.push(userData);
    }

    fs.writeFileSync(guildFilePath, JSON.stringify(existingData, null, 2), 'utf8');
}

// --- AUTO-ASSIGN UNVERIFIED ROLE ON JOIN ---
client.on('guildMemberAdd', async (member) => {
    const settingsPath = path.join(__dirname, 'data', 'settings.json');
    if (!fs.existsSync(settingsPath)) return;

    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const guildSettings = settings[member.guild.id];
        
        if (guildSettings && guildSettings.unverifiedRoleId) {
            await member.roles.add(guildSettings.unverifiedRoleId);
        }
    } catch (err) {
        console.error('Error assigning unverified role on join:', err);
    }
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('clientReady', async () => {
    console.log(`[SECURITY BOT] Logged in as ${client.user.tag}`);
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commandsArray }
        );
        console.log('[SECURITY BOT] Global slash commands successfully registered.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Handle Slash Commands and Button Interactions
client.on('interactionCreate', async (interaction) => {
    // 1. Slash Command Router
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            const errorReply = { content: 'There was an error executing this command!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorReply);
            } else {
                await interaction.reply(errorReply);
            }
        }
    }

    // 2. Button Handlers
    if (interaction.isButton()) {
        // --- VERIFICATION BUTTON ---
        if (interaction.customId === 'btn_verify') {
            const guildId = interaction.guild.id;
            const settingsPath = path.join(__dirname, 'data', 'settings.json');
            
            let verifiedRoleId = null;
            let unverifiedRoleId = null;

            if (fs.existsSync(settingsPath)) {
                try {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    if (settings[guildId]) {
                        verifiedRoleId = settings[guildId].verifiedRoleId;
                        unverifiedRoleId = settings[guildId].unverifiedRoleId;
                    }
                } catch (err) {
                    console.error('Error reading settings.json:', err);
                }
            }

            // Fallback to .env if no server-specific setting was saved yet
            if (!verifiedRoleId) {
                verifiedRoleId = process.env.VERIFIED_ROLE_ID;
            }

            if (!verifiedRoleId) {
                return interaction.reply({ 
                    content: '❌ Verification role is not configured for this server. Ask an admin to run `/setup-verify`.', 
                    ephemeral: true 
                });
            }

            const member = interaction.member;

            if (member.roles.cache.has(verifiedRoleId)) {
                return interaction.reply({ 
                    content: 'You are already verified!', 
                    ephemeral: true 
                });
            }

            try {
                // Add verified role
                await member.roles.add(verifiedRoleId);

                // Remove unverified role if it was configured and the user has it
                if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
                    await member.roles.remove(unverifiedRoleId);
                }

                const userRecord = {
                    userId: member.user.id,
                    username: member.user.tag,
                    displayName: member.user.displayName,
                    accountCreated: member.user.createdAt.toISOString(),
                    joinedServerAt: member.joinedAt ? member.joinedAt.toISOString() : 'Unknown',
                    verifiedAt: new Date().toISOString()
                };

                // Log user data specific to this guild ID[cite: 1]
                logUserData(interaction.guild.id, userRecord);

                await interaction.reply({ 
                    content: '🎉 Welcome to the server! You have been successfully verified.', 
                    ephemeral: true 
                });
            } catch (error) {
                console.error('Verification Error:', error);
                await interaction.reply({ 
                    content: '❌ Failed to complete verification. Check bot role hierarchy.', 
                    ephemeral: true 
                });
            }
        }

        // --- TICKET CREATION BUTTON (SEQUENTIAL NUMBERING) ---
        if (interaction.customId === 'create_ticket') {
            const guild = interaction.guild;
            const user = interaction.user;

            try {
                await interaction.deferReply({ ephemeral: true });

                // Find all existing channels starting with "ticket-" to determine the next number
                const existingTicketChannels = guild.channels.cache.filter(c => c.name.startsWith('ticket-'));
                
                let highestNumber = 0;
                existingTicketChannels.forEach(channel => {
                    const match = channel.name.match(/ticket-(\d+)/);
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num > highestNumber) highestNumber = num;
                    }
                });

                const nextNumber = highestNumber + 1;
                const formattedNum = String(nextNumber).padStart(4, '0'); // Formats as 0001, 0002, etc.
                const channelName = `ticket-${formattedNum}`;

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: 0, // GuildText
                    permissionOverwrites: [
                        {
                            id: guild.id, // @everyone
                            deny: ['ViewChannel']
                        },
                        {
                            id: user.id, // The user
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                        },
                        {
                            id: client.user.id, // The bot
                            allow: ['ViewChannel', 'SendMessages', 'ManageChannels']
                        }
                    ]
                });

                const ticketEmbed = new EmbedBuilder()
                    .setTitle(`Ticket #${formattedNum} (${user.tag})`)
                    .setDescription('Staff will be with you shortly. Describe your issue or verification question below.')
                    .setColor(0x5865F2);

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

                await ticketChannel.send({ 
                    content: `<@${user.id}> Welcome!`, 
                    embeds: [ticketEmbed], 
                    components: [closeRow] 
                });

                await interaction.editReply({ 
                    content: `✅ Ticket created successfully! Head over to ${ticketChannel} to chat with staff.` 
                });
            } catch (error) {
                console.error('Ticket Creation Error:', error);
                if (interaction.deferred) {
                    await interaction.editReply({ content: '❌ Failed to create ticket channel. Check bot permissions.' });
                } else {
                    await interaction.reply({ content: '❌ Failed to create ticket channel.', ephemeral: true });
                }
            }
        }

        // --- TICKET CLOSE BUTTON ---
        if (interaction.customId === 'close_ticket') {
            const channel = interaction.channel;
            
            await interaction.reply({ content: '🔒 Closing ticket and deleting channel in 5 seconds...' });
            
            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);