module.exports = {
  async execute(interaction, client) {
    const { voiceManager } = client;

    const connection = voiceManager.getConnection(interaction.guild.id);

    if (!connection) {
      return interaction.reply({
        content: '❌ Greg isn\'t in a voice channel right now.',
        flags: 64,
      });
    }

    voiceManager.leave(interaction.guild.id);

    await interaction.reply({
      content: '👋 Greg left the voice channel. See you next time!',
    });
  },
};
