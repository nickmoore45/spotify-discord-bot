require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { registerCommands } = require('./deploy-commands');
const SpotifyManager = require('./spotify/SpotifyManager');
const VoiceManager = require('./voice/VoiceManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const spotifyManager = new SpotifyManager();
const voiceManager = new VoiceManager(spotifyManager);

client.spotifyManager = spotifyManager;
client.voiceManager = voiceManager;

client.commands = new Collection();
const commands = require('./commands');
for (const [name, command] of Object.entries(commands)) {
  client.commands.set(name, command);
}

client.once('clientReady', async () => {
  console.log(`\n🎵 Greg is online as ${client.user.tag}`);
  console.log(`📡 Registered in ${client.guilds.cache.size} server(s)\n`);
  await registerCommands(client);
  spotifyManager.startAuthServer();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);
    const msg = { content: '❌ Something went wrong.', flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
