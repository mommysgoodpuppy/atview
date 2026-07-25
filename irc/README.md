# Workman IRC client

A small IRC client written entirely in Workman. There are no handwritten JavaScript or TypeScript
files.

Implemented:

- configurable host, port, nickname, and initial channel;
- certificate-verified TLS through `node:tls`;
- IRC registration (`NICK` and `USER`);
- TCP chunk-safe IRC line framing without mutable Workman references;
- parsing of prefixes, commands, middle parameters, and trailing parameters;
- automatic `PONG` replies;
- automatic initial `JOIN` after numeric `001`;
- display of `PRIVMSG`, `NOTICE`, and `ERROR`;
- interactive channel messages, `/join`, `/msg`, and `/quit`;
- protocol unit tests.

## Run the tests

```sh
wm check irc/protocol-test.wm
wm run irc/protocol-test.wm
wm check irc/client.wm
```

## Run the client

```sh
wm run irc/client.wm -- irc.libera.chat 6697 mynick '#mychannel'
```

The defaults are Libera.Chat on its official TLS port, so all arguments are optional except that a
distinct nickname is useful:

```sh
wm run irc/client.wm -- irc.libera.chat 6697 wm-example-123 '#workman'
```

The live channel-read test used tilde.chat's bot channel:

```sh
wm run irc/client.wm -- irc.tilde.chat 6697 wm-example-123 '#bots'
# once registered:
/join #bots
```

The client does not automatically join a channel. Join only a channel where you have permission to
run this client. The client sends IRC lines terminated by CRLF. Its input commands are:

```text
hello channel
/join #other
/msg alice private hello
/quit
```

See [PROGRESS.md](./PROGRESS.md) for the stress-test findings and exact blockers.
