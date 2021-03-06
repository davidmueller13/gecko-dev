/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/
*/

// This tests the public Telemetry API for submitting pings.

"use strict";

Cu.import("resource://gre/modules/TelemetryController.jsm", this);
Cu.import("resource://gre/modules/TelemetrySession.jsm", this);
Cu.import("resource://gre/modules/TelemetryArchive.jsm", this);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", this);
Cu.import("resource://gre/modules/osfile.jsm", this);
Cu.import("resource://gre/modules/Task.jsm", this);
Cu.import("resource://gre/modules/Services.jsm", this);

XPCOMUtils.defineLazyGetter(this, "gPingsArchivePath", function() {
  return OS.Path.join(OS.Constants.Path.profileDir, "datareporting", "archived");
});

const PREF_TELEMETRY_ENABLED = "toolkit.telemetry.enabled";
const Telemetry = Cc["@mozilla.org/base/telemetry;1"].getService(Ci.nsITelemetry);

function run_test() {
  do_get_profile(true);
  Services.prefs.setBoolPref(PREF_TELEMETRY_ENABLED, true);
  run_next_test();
}

add_task(function* test_archivedPings() {
  // TelemetryController should not be fully initialized at this point.
  // Submitting pings should still work fine.

  const PINGS = [
    {
      type: "test-ping-api-1",
      payload: { foo: "bar"},
      dateCreated: new Date(2010, 1, 1, 10, 0, 0),
    },
    {
      type: "test-ping-api-2",
      payload: { moo: "meh"},
      dateCreated: new Date(2010, 2, 1, 10, 0, 0),
    },
  ];

  // Submit pings and check the ping list.
  let expectedPingList = [];

  for (let data of PINGS) {
    fakeNow(data.dateCreated);
    data.id = yield TelemetryController.submitExternalPing(data.type, data.payload);
    let list = yield TelemetryArchive.promiseArchivedPingList();

    expectedPingList.push({
      id: data.id,
      type: data.type,
      timestampCreated: data.dateCreated.getTime(),
    });
    Assert.deepEqual(list, expectedPingList, "Archived ping list should contain submitted pings");
  }

  // Check loading the archived pings.
  let ids = [for (p of PINGS) p.id];
  let checkLoadingPings = Task.async(function*() {
    for (let data of PINGS) {
      let ping = yield TelemetryArchive.promiseArchivedPingById(data.id);
      Assert.equal(ping.id, data.id, "Archived ping should have matching id");
      Assert.equal(ping.type, data.type, "Archived ping should have matching type");
      Assert.equal(ping.creationDate, data.dateCreated.toISOString(),
                   "Archived ping should have matching creation date");
    }
  });

  yield checkLoadingPings();

  // Check that we find the archived pings again by scanning after a restart.
  TelemetryController.reset();

  let pingList = yield TelemetryArchive.promiseArchivedPingList();
  Assert.deepEqual(expectedPingList, pingList,
                   "Should have submitted pings in archive list after restart");
  yield checkLoadingPings();

  // Write invalid pings into the archive with both valid and invalid names.
  let writeToArchivedDir = Task.async(function*(dirname, filename, content, compressed) {
    const dirPath = OS.Path.join(gPingsArchivePath, dirname);
    yield OS.File.makeDir(dirPath, { ignoreExisting: true });
    const filePath = OS.Path.join(dirPath, filename);
    const options = { tmpPath: filePath + ".tmp", noOverwrite: false };
    if (compressed) {
      options.compression = "lz4";
    }
    yield OS.File.writeAtomic(filePath, content, options);
  });

  const FAKE_ID1 = "10000000-0123-0123-0123-0123456789a1";
  const FAKE_ID2 = "20000000-0123-0123-0123-0123456789a2";
  const FAKE_ID3 = "20000000-0123-0123-0123-0123456789a3";
  const FAKE_TYPE = "foo";

  // These should get rejected.
  yield writeToArchivedDir("xx", "foo.json", "{}");
  yield writeToArchivedDir("2010-02", "xx.xx.xx.json", "{}");
  // This one should get picked up...
  yield writeToArchivedDir("2010-02", "1." + FAKE_ID1 + "." + FAKE_TYPE + ".json", "{}");
  // ... but get overwritten by this one.
  yield writeToArchivedDir("2010-02", "2." + FAKE_ID1 + "." + FAKE_TYPE + ".json", "");
  // This should get picked up fine.
  yield writeToArchivedDir("2010-02", "3." + FAKE_ID2 + "." + FAKE_TYPE + ".json", "");
  // This compressed ping should get picked up fine as well.
  yield writeToArchivedDir("2010-02", "4." + FAKE_ID3 + "." + FAKE_TYPE + ".jsonlz4", "");

  expectedPingList.push({
    id: FAKE_ID1,
    type: "foo",
    timestampCreated: 2,
  });
  expectedPingList.push({
    id: FAKE_ID2,
    type: "foo",
    timestampCreated: 3,
  });
  expectedPingList.push({
    id: FAKE_ID3,
    type: "foo",
    timestampCreated: 4,
  });
  expectedPingList.sort((a, b) => a.timestampCreated - b.timestampCreated);

  // Reset the TelemetryArchive so we scan the archived dir again.
  yield TelemetryController.reset();

  // Check that we are still picking up the valid archived pings on disk,
  // plus the valid ones above.
  pingList = yield TelemetryArchive.promiseArchivedPingList();
  Assert.deepEqual(expectedPingList, pingList, "Should have picked up valid archived pings");
  yield checkLoadingPings();

  // Now check that we fail to load the two invalid pings from above.
  Assert.ok((yield promiseRejects(TelemetryArchive.promiseArchivedPingById(FAKE_ID1))),
            "Should have rejected invalid ping");
  Assert.ok((yield promiseRejects(TelemetryArchive.promiseArchivedPingById(FAKE_ID2))),
            "Should have rejected invalid ping");
});

add_task(function* test_archiveCleanup() {
  const PING_TYPE = "foo";

  // Create a ping which should be pruned because it is past the retention period.
  fakeNow(2010, 1, 1, 1, 0, 0);
  const PING_ID1 = yield TelemetryController.submitExternalPing(PING_TYPE, {}, {});
  // Create a ping which should be kept because it is within the retention period.
  fakeNow(2010, 2, 1, 1, 0, 0);
  const PING_ID2 = yield TelemetryController.submitExternalPing(PING_TYPE, {}, {});
  // Create a ping which should be kept because it is within the retention period.
  fakeNow(2010, 3, 1, 1, 0, 0);
  const PING_ID3 = yield TelemetryController.submitExternalPing(PING_TYPE, {}, {});

  // Move the current date 180 days ahead of the PING_ID1 ping.
  fakeNow(2010, 7, 1, 1, 0, 0);
  // Reset TelemetryArchive and TelemetryController to start the startup cleanup.
  yield TelemetryController.reset();
  // Wait for the cleanup to finish.
  yield TelemetryStorage.testCleanupTaskPromise();
  // Then scan the archived dir.
  let pingList = yield TelemetryArchive.promiseArchivedPingList();

  // The PING_ID1 ping should be removed and the other 2 kept.
  Assert.ok((yield promiseRejects(TelemetryArchive.promiseArchivedPingById(PING_ID1))),
            "Old pings should be removed from the archive");
  Assert.ok((yield TelemetryArchive.promiseArchivedPingById(PING_ID2)),
            "Recent pings should be kept in the archive");
  Assert.ok((yield TelemetryArchive.promiseArchivedPingById(PING_ID3)),
            "Recent pings should be kept in the archive");

  // Move the current date 180 days ahead of the PING_ID2 ping.
  fakeNow(2010, 8, 1, 1, 0, 0);
  // Reset TelemetryController but not the TelemetryArchive: the cleanup task will update
  // the existing archive cache.
  yield TelemetryController.reset();
  // Wait for the cleanup to finish.
  yield TelemetryStorage.testCleanupTaskPromise();
  // Then scan the archived dir again.
  pingList = yield TelemetryArchive.promiseArchivedPingList();

  // The PING_ID2 ping should be removed and PING_ID3 kept.
  Assert.ok((yield promiseRejects(TelemetryArchive.promiseArchivedPingById(PING_ID2))),
            "Old pings should be removed from the archive");
  Assert.ok((yield TelemetryArchive.promiseArchivedPingById(PING_ID3)),
            "Recent pings should be kept in the archive");
});

add_task(function* test_clientId() {
  // Check that a ping submitted after the delayed telemetry initialization completed
  // should get a valid client id.
  yield TelemetryController.setup();
  const clientId = TelemetryController.clientID;

  let id = yield TelemetryController.submitExternalPing("test-type", {}, {addClientId: true});
  let ping = yield TelemetryArchive.promiseArchivedPingById(id);

  Assert.ok(!!ping, "Should have loaded the ping.");
  Assert.ok("clientId" in ping, "Ping should have a client id.")
  Assert.ok(UUID_REGEX.test(ping.clientId), "Client id is in UUID format.");
  Assert.equal(ping.clientId, clientId, "Ping client id should match the global client id.");

  // We should have cached the client id now. Lets confirm that by
  // checking the client id on a ping submitted before the async
  // controller setup is finished.
  let promiseSetup = TelemetryController.reset();
  id = yield TelemetryController.submitExternalPing("test-type", {}, {addClientId: true});
  ping = yield TelemetryArchive.promiseArchivedPingById(id);
  Assert.equal(ping.clientId, clientId);

  // Finish setup.
  yield promiseSetup;
});

add_task(function* test_InvalidPingType() {
  const TYPES = [
    "a",
    "-",
    "¿€€€?",
    "-foo-",
    "-moo",
    "zoo-",
    ".bar",
    "asfd.asdf",
  ];

  for (let type of TYPES) {
    let histogram = Telemetry.getKeyedHistogramById("TELEMETRY_INVALID_PING_TYPE_SUBMITTED");
    Assert.equal(histogram.snapshot(type).sum, 0,
                 "Should not have counted this invalid ping yet: " + type);
    Assert.ok(promiseRejects(TelemetryController.submitExternalPing(type, {})),
              "Ping type should have been rejected.");
    Assert.equal(histogram.snapshot(type).sum, 1,
                 "Should have counted this as an invalid ping type.");
  }
});

add_task(function* test_currentPingData() {
  yield TelemetrySession.setup();

  // Setup test data.
  let h = Telemetry.getHistogramById("TELEMETRY_TEST_RELEASE_OPTOUT");
  h.clear();
  h.add(1);
  let k = Telemetry.getKeyedHistogramById("TELEMETRY_TEST_KEYED_RELEASE_OPTOUT");
  k.clear();
  k.add("a", 1);

  // Get current ping data objects and check that their data is sane.
  for (let subsession of [true, false]) {
    let ping = TelemetryController.getCurrentPingData(subsession);

    Assert.ok(!!ping, "Should have gotten a ping.");
    Assert.equal(ping.type, "main", "Ping should have correct type.");
    const expectedReason = subsession ? "gather-subsession-payload" : "gather-payload";
    Assert.equal(ping.payload.info.reason, expectedReason, "Ping should have the correct reason.");

    let id = "TELEMETRY_TEST_RELEASE_OPTOUT";
    Assert.ok(id in ping.payload.histograms, "Payload should have test count histogram.");
    Assert.equal(ping.payload.histograms[id].sum, 1, "Test count value should match.");
    id = "TELEMETRY_TEST_KEYED_RELEASE_OPTOUT";
    Assert.ok(id in ping.payload.keyedHistograms, "Payload should have keyed test histogram.");
    Assert.equal(ping.payload.keyedHistograms[id]["a"].sum, 1, "Keyed test value should match.");
  }
});
