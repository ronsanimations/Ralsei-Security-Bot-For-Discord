const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-verify')
        .setDescription('Configure and post the verification panel for this server.')
        .addRoleOption(option =>
            option.setName('verified_role')
                .setDescription('The role to give users when they verify.')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('unverified_role')
                .setDescription('The role to automatically give users when they join.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(0x8), // Administrator only

    async execute(interaction) {
        // 1. Instantly defer so Discord never times out
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guild = interaction.guild;
        const verifiedRole = interaction.options.getRole('verified_role');
        const unverifiedRole = interaction.options.getRole('unverified_role');
        
        const settingsDir = path.join(__dirname, '../data');
        const settingsPath = path.join(settingsDir, 'settings.json');

        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        let settings = {};
        if (fs.existsSync(settingsPath)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            } catch (err) {
                console.error('Error reading settings.json:', err);
            }
        }

        // Save both roles for this server
        settings[guild.id] = {
            verifiedRoleId: verifiedRole.id,
            unverifiedRoleId: unverifiedRole.id
        };

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        const verifyEmbed = new EmbedBuilder()
            .setTitle('🛡️ Server Verification')
            .setDescription('Click the button below to complete the security check and gain access to the server.')
            .setColor(0x5865F2);

        const verifyRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_verify')
                .setLabel('Verify Account')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );

        // Send the panel to the channel
        await interaction.channel.send({
            embeds: [verifyEmbed],
            components: [verifyRow]
        });

        // Edit the reply to confirm success
        await interaction.editReply({
            content: `✅ Verification panel successfully posted!\n- Verified Role: ${verifiedRole}\n- Unverified Role: ${unverifiedRole}`
        });
    },
};