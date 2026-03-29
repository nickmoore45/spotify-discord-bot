const { EmbedBuilder } = require('discord.js');

module.exports = {
  async execute(interaction, client) {
    const { spotifyManager, voiceManager } = client;

    await interaction.deferReply();

    // ── Check Spotify is connected ─────────────────────────────────────────
    if (!spotifyManager.isConnected(interaction.user.id)) {
      return interaction.editReply({
        content: '❌ You haven\'t connected your Spotify account yet. Use `/connect` first!',
      });
    }

    // ── Check user is in a voice channel ──────────────────────────────────
    const member = interaction.member;
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        content: '❌ You need to be in a voice channel first! Join one and try again.',
      });
    }

    // ── Check bot permissions ─────────────────────────────────────────────
    const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return interaction.editReply({
        content: `❌ I don't have permission to join or speak in **${voiceChannel.name}**.`,
      });
    }

    try {
      // ── Join voice channel & start librespot device ───────────────────
      await voiceManager.join(interaction.guild.id, voiceChannel, interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('🎵 Greg joined the voice chat')
        .setDescription(
          `Joined **${voiceChannel.name}**!\n\n` +
          `Open Spotify and look for **\`${process.env.SPOTIFY_DEVICE_NAME}\`** in your device list.\n` +
          `Hit play — Greg will stream it here. 🎧`
        )
        .setColor(0x1DB954)
        .setFooter({ text: 'Use /leave to disconnect Greg.' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Join error:', error);
      await interaction.editReply({
        content: `❌ Failed to join voice channel: ${error.message}`,
      });
    }
  },
};
