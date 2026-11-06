const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Posts the support ticket panel in this channel.')
        .setDefaultMemberPermissions(0x8), // Administrator only
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎫 Support & Verification Assistance')
            .setDescription('Need help getting verified or have a security question? Click the button below to open a private support ticket with staff.')
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Open Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Ticket panel deployed successfully!', ephemeral: true });
    },
};