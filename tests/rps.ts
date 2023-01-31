import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  Connection,
  Commitment,
} from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import { Rps } from "../target/types/rps";
import { BN } from "bn.js";
import { keccak_256 } from "js-sha3";

import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("rps", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Rps as Program<Rps>;

  const LAMPORTS_PER_SOL = new BN(1000000000);
  const WRAPPED_SOL_MINT = new anchor.web3.PublicKey(
    "So11111111111111111111111111111111111111112"
  );

  it("Is initialized!", async () => {
    const player = anchor.web3.Keypair.generate();
    const gameSeed = new BN(10);
    const [game, _gameBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("game")),
        gameSeed.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const provider = anchor.getProvider();
    const salt = Math.floor(Math.random() * 10000000);
    const player1Choice = 1;

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        player.publicKey,
        1000000000 * 10
      )
    );

    const mintAuthority = anchor.web3.Keypair.generate();
    const mint = await createMint(
      provider.connection,
      player,
      mintAuthority.publicKey,
      null,
      0
    );
    const tokenAccount = await createAccount(
      provider.connection,
      player,
      mint,
      player.publicKey
    );
    await mintTo(
      provider.connection,
      player,
      mint,
      tokenAccount,
      mintAuthority,
      10
    );

    // const acc = await getAccount(provider.connection, tokenAccount);
    // console.log("Token account ", acc);

    const [gameAuthority, _gameAuthorityBump] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("authority")),
          game.toBuffer(),
        ],
        program.programId
      );
    const [escrowTokenAccount, _escrowTokenAccountBump] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("escrow")),
          game.toBuffer(),
        ],
        program.programId
      );

    const buf = Buffer.concat([
      player.publicKey.toBuffer(),
      new anchor.BN(salt).toArrayLike(Buffer, "le", 8),
      new anchor.BN(player1Choice).toArrayLike(Buffer, "le", 1),
    ]);
    let commitment = Buffer.from(keccak_256(buf), "hex");

    const tx = await program.methods
      .createGame(gameSeed, commitment.toJSON().data, new BN(10))
      .accounts({
        game: game,
        player: player.publicKey,
        mint: mint,
        playerTokenAccount: tokenAccount,
        gameAuthority: gameAuthority,
        escrowTokenAccount: escrowTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([player])
      .rpc();

    console.log("Your transaction signature", tx);

    const gameAccount = await program.account.game.fetch(game);
    console.log("Your game account", gameAccount);

    const player2 = anchor.web3.Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        player2.publicKey,
        1000000000 * 10
      )
    );

    const tokenAccount2 = await createAccount(
      provider.connection,
      player2,
      mint,
      player2.publicKey
    );
    await mintTo(
      provider.connection,
      player2,
      mint,
      tokenAccount2,
      mintAuthority,
      10
    );

    const tx2 = await program.methods
      .joinGame({ rock: {} }, null)
      .accounts({
        player: player2.publicKey,
        game: game,
        playerTokenAccount: tokenAccount2,
        gameAuthority: gameAuthority,
        escrowTokenAccount: escrowTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([player2])
      .rpc({ skipPreflight: true });
    console.log("Your transaction signature", tx);

    const gameAccount2 = await program.account.game.fetch(game);
    console.log("Your game account", gameAccount2);

    const tx3 = await program.methods
      .revealGame({ paper: {} }, new BN(salt))
      .accounts({
        player: player.publicKey,
        game: game,
      })
      .signers([player])
      .rpc({ skipPreflight: true });

    const gameAccount3 = await program.account.game.fetch(game);
    console.log("Your game account", gameAccount3);

    const tx4 = await program.methods
      .settleGame()
      .accounts({
        game: game,
        player1TokenAccount: tokenAccount,
        player2TokenAccount: tokenAccount2,
        gameAuthority: gameAuthority,
        escrowTokenAccount: escrowTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true });

    const gameAccount4 = await program.account.game.fetch(game);
    console.log("Your game account", JSON.stringify(gameAccount4));

    const acc = await getAccount(provider.connection, tokenAccount);
    console.log("Token account amount", acc.amount);

    const cleaner = anchor.web3.Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        cleaner.publicKey,
        1000000000 * 10
      )
    );
    const cleanerBalanceBefore = await provider.connection.getBalance(
      cleaner.publicKey
    );

    const tx5 = await program.methods
      .cleanGame()
      .accounts({
        game: game,
        gameAuthority: gameAuthority,
        escrowTokenAccount: escrowTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        cleaner: cleaner.publicKey,
      })
      .signers([cleaner])
      .rpc({ skipPreflight: true });
    const cleanerBalanceAfter = await provider.connection.getBalance(
      cleaner.publicKey
    );

    // should assert this is positive or some fixed value
    console.log(cleanerBalanceAfter - cleanerBalanceBefore);
  });
});
