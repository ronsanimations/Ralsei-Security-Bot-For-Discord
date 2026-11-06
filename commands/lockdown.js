const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lockdown')
        .setDescription('DMs verified users, nukes channels/roles, and secures the server.')
        .addStringOption(option =>
            option.setName('invite_link')
                .setDescription('The invite link to the new secure server.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(0x8), // Administrator only

    async execute(interaction) {
        const inviteLink = interaction.options.getString('invite_link');
        const guild = interaction.guild;
        const guildFilePath = path.join(__dirname, `../data/${guild.id}.json`);

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // 1. Send Migration DMs to logged verified users for this specific server
        let successCount = 0;
        let failCount = 0;

        if (fs.existsSync(guildFilePath)) {
            try {
                const verifiedUsers = JSON.parse(fs.readFileSync(guildFilePath, 'utf8'));
                const lockdownEmbed = new EmbedBuilder()
                    .setTitle('🚨 Server Lockdown & Migration Notice')
                    .setDescription(`An emergency lockdown has been initiated in **${guild.name}**. The server is being decommissioned.`)
                    .addFields(
                        { name: 'New Secure Server', value: `Please join our new secure server using the link below:\n${inviteLink}` }
                    )
                    .setColor(0xED4245)
                    .setTimestamp();

                for (const record of verifiedUsers) {
                    try {
                        const user = await interaction.client.users.fetch(record.userId);
                        if (user) {
                            await user.send({ embeds: [lockdownEmbed] });
                            successCount++;
                        }
                    } catch {
                        failCount++;
                    }
                }
            } catch (err) {
                console.error(`Error reading data for guild ${guild.id}:`, err);
            }
        }

        await interaction.editReply({
            content: `✅ Broadcast finished (DMed: ${successCount}, Failed: ${failCount}). Securing server now...`
        });

        // 2. Delete all existing server invite links
        try {
            const invites = await guild.invites.fetch();
            invites.forEach(inv => inv.delete().catch(() => {}));
        } catch (err) {
            console.error('Error deleting invites:', err.message);
        }

        // 3. Kick all non-bot members (except owner)
        try {
            const members = await guild.members.fetch();
            for (const [_, member] of members) {
                if (!member.user.bot && member.id !== guild.ownerId) {
                    await member.kick('Server Lockdown Migration').catch(() => {});
                }
            }
        } catch (err) {
            console.error('Error kicking members:', err.message);
        }

        // 4. Delete all channels
        guild.channels.cache.forEach(channel => {
            channel.delete().catch(() => {});
        });

        // 5. Delete all custom roles (except managed bot roles and @everyone)
        guild.roles.cache.forEach(role => {
            if (!role.managed && role.name !== '@everyone') {
                role.delete().catch(() => {});
            }
        });
    },
};