import test from "node:test";
import assert from "node:assert/strict";
import {
  computeKeyFingerprint,
  decryptTeamKeyAsMember,
  encryptTeamKeyForMember,
  generateTeamKey,
  generateX25519KeyPair,
} from "./crypto.ts";

test("computeKeyFingerprint is stable for the same key", () => {
  const keypair = generateX25519KeyPair();
  const first = computeKeyFingerprint(keypair.publicKey);
  const second = computeKeyFingerprint(keypair.publicKey);

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f-]+$/);
});

test("team key roundtrip succeeds for the intended recipient", () => {
  const recipient = generateX25519KeyPair();
  const teamKey = generateTeamKey();

  const envelope = encryptTeamKeyForMember(teamKey, recipient.publicKey);
  const decrypted = decryptTeamKeyAsMember(
    envelope.ephemeralPublicKey,
    envelope.encryptedKey,
    envelope.iv,
    envelope.tag,
    recipient.privateKey
  );

  assert.deepEqual(decrypted, teamKey);
});

test("team key decrypt fails for the wrong recipient", () => {
  const intendedRecipient = generateX25519KeyPair();
  const wrongRecipient = generateX25519KeyPair();
  const teamKey = generateTeamKey();

  const envelope = encryptTeamKeyForMember(teamKey, intendedRecipient.publicKey);

  assert.throws(() => {
    decryptTeamKeyAsMember(
      envelope.ephemeralPublicKey,
      envelope.encryptedKey,
      envelope.iv,
      envelope.tag,
      wrongRecipient.privateKey
    );
  });
});

test("tampered team key envelope fails authentication", () => {
  const recipient = generateX25519KeyPair();
  const teamKey = generateTeamKey();
  const envelope = encryptTeamKeyForMember(teamKey, recipient.publicKey);
  const tamperedCiphertext = Buffer.from(envelope.encryptedKey, "base64");
  tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;

  assert.throws(() => {
    decryptTeamKeyAsMember(
      envelope.ephemeralPublicKey,
      tamperedCiphertext.toString("base64"),
      envelope.iv,
      envelope.tag,
      recipient.privateKey
    );
  });
});
