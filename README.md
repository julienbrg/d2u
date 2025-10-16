# D2U

Sybil-proof, coercion-resistant, privacy-preserving and passkey-friendly onchain voting system. The project integrates with [w3pk](https://github.com/w3hc/w3pk) which allows everyone to easily use passkeys to sign transactions, manage stealth addresses, ZK proofs and more.

[**Live demo**](http://d2u.w3hc.org/voting)

- [w3pk](https://github.com/w3hc/w3pk) (brand new SDK)
- [WebAuthn API](https://github.com/julienbrg/nestjs-webauthn) (implements WebAuthn workflow)
- [Stealth Gov contracts](https://github.com/w3hc/stealth-gov)

[Human Passport](https://passport.human.tech/) makes the system resistant to Sybil attacks.

## Install

```bash
pnpm i
```

## Run

Create a `.env` file:

```bash
cp .env.template .env
```

Add your own keys in the `.env` file then:

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Documentation References

- [React 19](https://react.dev/blog/2024/12/05/react-19) - Latest React features
- [Next.js 15](https://nextjs.org/docs) - React framework
- [Chakra UI v2](https://v2.chakra-ui.com/) - UI component library
- [Ethers.js v6](https://docs.ethers.org/v6/) - Ethereum library
- [Reown AppKit](https://reown.com/appkit) - Web3 wallet connection

## Support

You can reach out to [Julien](https://github.com/julienbrg) on [Farcaster](https://warpcast.com/julien-), [Element](https://matrix.to/#/@julienbrg:matrix.org), [Status](https://status.app/u/iwSACggKBkp1bGllbgM=#zQ3shmh1sbvE6qrGotuyNQB22XU5jTrZ2HFC8bA56d5kTS2fy), [Telegram](https://t.me/julienbrg), [Twitter](https://twitter.com/julienbrg), [Discord](https://discordapp.com/users/julienbrg), or [LinkedIn](https://www.linkedin.com/in/julienberanger/).

<img src="https://bafkreid5xwxz4bed67bxb2wjmwsec4uhlcjviwy7pkzwoyu5oesjd3sp64.ipfs.w3s.link" alt="built-with-ethereum-w3hc" width="100"/>
