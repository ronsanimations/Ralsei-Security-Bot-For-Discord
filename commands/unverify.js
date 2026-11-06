const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unverify')
        .setDescription('Removes your verified role, restores your unverified role, and wipes your data globally.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild ? interaction.guild.id : null;
        const dataDir = path.join(__dirname, '../data');
        const settingsPath = path.join(dataDir, 'settings.json');

        let roleRemoved = false;
        let roleAdded = false;

        // 1. Handle server-specific roles if run inside a guild
        if (interaction.guild) {
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

            // Fallback to .env if needed
            if (!verifiedRoleId) {
                verifiedRoleId = process.env.VERIFIED_ROLE_ID;
            }

            try {
                const member = await interaction.guild.members.fetch(userId);
                if (member) {
                    // Remove the verified role if they have it
                    if (verifiedRoleId && member.roles.cache.has(verifiedRoleId)) {
                        await member.roles.remove(verifiedRoleId);
                        roleRemoved = true;
                    }

                    // Give back the unverified role if it's configured for this server
                    if (unverifiedRoleId && !member.roles.cache.has(unverifiedRoleId)) {
                        await member.roles.add(unverifiedRoleId);
                        roleAdded = true;
                    }
                }
            } catch (err) {
                console.log(`Could not update roles for ${userId} in guild ${guildId}:`, err.message);
            }
        }

        // 2. Global Data Wipe across all server JSON files (excluding settings.json)
        let filesRemovedFrom = 0;
        if (fs.existsSync(dataDir)) {
            const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json') && file !== 'settings.json');
            
            for (const file of files) {
                const filePath = path.join(dataDir, file);
                try {
                    let guildData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (Array.isArray(guildData)) {
                        const initialLength = guildData.length;
                        
                        // Filter out the user ID
                        guildData = guildData.filter(u => u.userId !== userId);
                        
                        if (guildData.length < initialLength) {
                            fs.writeFileSync(filePath, JSON.stringify(guildData, null, 2), 'utf8');
                            filesRemovedFrom++;
                        }
                    }
                } catch (err) {
                    console.error(`Error processing file ${file}:`, err);
                }
            }
        }

        if (roleRemoved || roleAdded || filesRemovedFrom > 0) {
            await interaction.reply({
                content: `🗑️ **Unverify Complete:** Your verified role has been removed, your unverified role has been restored, and your data has been purged from **${filesRemovedFrom}** server database(s).`,
                flags: [MessageFlags.Ephemeral]
            });
        } else {
            await interaction.reply({
                content: `ℹ️ You were not found in any verification databases or already unverified.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
    },
};