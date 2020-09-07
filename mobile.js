var apiKey='none';
var trackID = 'TRLRVJF13A79B07430';
var track_url = trackID + '.mp3'

var remixer;
var player;
var driver;
var track;

var minRandomBranchChance = .08
var maxRandomBranchChance = .5
var randomBranchChanceDelta =.012;
var curRandomBranchChance = minRandomBranchChance;
var branchThreshold = 65;
var MAX_BRANCHES = 8;
var totalBeats = 0;

function info(s) {
    $("#time").text(s);
}

function error(s) {
    $("#time").text(s);
}

function stop() {
    player.stop();
    player = remixer.getPlayer();
}

var timbreWeight = 1, pitchWeight = 10, 
    loudStartWeight = 1, loudMaxWeight = 1, 
    durationWeight = 100, confidenceWeight = 1;

function get_seg_distances(seg1, seg2) {
    var timbre = seg_distance(seg1, seg2, 'timbre', true);
    var pitch = seg_distance(seg1, seg2, 'pitches');
    var sloudStart = Math.abs(seg1.loudness_start - seg2.loudness_start);
    var sloudMax = Math.abs(seg1.loudness_max - seg2.loudness_max);
    var duration = Math.abs(seg1.duration - seg2.duration);
    var confidence = Math.abs(seg1.confidence - seg2.confidence);
    var distance = timbre * timbreWeight + pitch * pitchWeight + 
        sloudStart * loudStartWeight + sloudMax * loudMaxWeight + 
        duration * durationWeight + confidence * confidenceWeight;
    return distance;
}

function calculateNearestNeighbors(type, neighbors, threshold) {
    for (var qi = 0; qi < track.analysis[type].length; qi++)  {
        var isLast = qi == track.analysis[type].length - 1;
        var q1 = track.analysis[type][qi];
        var distances = [];
        for (var i = 0; i < track.analysis[type].length; i++) {

            if (i === qi) {
                continue;
            }

            var q2 = track.analysis[type][i];
            var sum = 0;
            for (var j = 0; j < q1.overlappingSegments.length; j++) {
                var seg1 = q1.overlappingSegments[j];
                var distance = 100;
                if (j < q2.overlappingSegments.length) {
                    var seg2 = q2.overlappingSegments[j];
                    // some segments can overlap many quantums,
                    // we don't want this self segue, so give them a
                    // high distance
                    if (seg1.which === seg2.which) {
                        distance = 100
                    } else {
                        distance = get_seg_distances(seg1, seg2);
                    }
                } 
                sum += distance;
            }
            var pdistance = q1.indexInParent == q2.indexInParent ? 0 : 100;
            var totalDistance = sum / q1.overlappingSegments.length + pdistance;
            if (totalDistance < threshold) {
                distances.push( [q2, totalDistance] );
            }
        }

        distances.sort( 
            function(a,b) {
                if (a[1] > b[1]) {
                    return 1;
                } else if (b[1] > a[1]) {
                    return -1;
                } else {
                    return 0;
                }
            }
        );

        q1.neighbors = [];
        for (i = 0; i < neighbors && i < distances.length; i++) {
            q1.neighbors.push(distances[i]);
        }
    }
}

function seg_distance(seg1, seg2, field, weighted) {
    if (weighted) {
        return weighted_euclidean_distance(seg1[field], seg2[field]);
    } else {
        return euclidean_distance(seg1[field], seg2[field]);
    }
}


function euclidean_distance(v1, v2) {
    var sum = 0;

    for (var i = 0; i < v1.length; i++) {
        var delta = v2[i] - v1[i];
        sum += delta * delta;
    }
    return Math.sqrt(sum);
}

function weighted_euclidean_distance(v1, v2) {
    var sum = 0;

    //for (var i = 0; i < 4; i++) {
    for (var i = 0; i < v1.length; i++) {
        var delta = v2[i] - v1[i];
        //var weight = 1.0 / ( i + 1.0);
        var weight = 1.0;
        sum += delta * delta * weight;
    }
    return Math.sqrt(sum);
}


function init() {
    $("#go").hide();
    $("#go").click(
        function() {
            if (driver.isRunning()) {
                driver.stop();
            } else {
                driver.start();
            }
        }
    );

    if (window.webkitAudioContext === undefined) {
        error("Sorry, this app needs advanced web audio. Your browser doesn't"
            + " support it. Try the latest version of Chrome");


    } else {
        var context = new webkitAudioContext();
        remixer = createJRemixer(context, apiKey, $);
        player = remixer.getPlayer();

        info("Loading track ...");

        remixer.fetchAnalyzedTrack(TRLRVJF13A79B07430, track_url, function(t) {
            track = t;
            if (t.status === 'ok') {
                info("ready!");
                $("#go").show();
                calculateNearestNeighbors('beats', MAX_BRANCHES, branchThreshold);
                driver = Driver(player, track.analysis.beats)
            } else {
                info(t.status);
            }
        });
    }

}

function Driver(player, beats) {
    var curBeat = null;
    var nextBeat = null;
    var curOp = null;
    var incr = 1;

    var beatDiv = $("#beats");
    var timeDiv = $("#time");

    var verses = [31, 147, 211, 320, 391];

    function next() {
        if (curBeat == null || curBeat == undefined) {
            return beats[0];
        } else {
            var nextIndex = curBeat.which + incr;
            if (nextIndex >= 463) {
                var nextIndex = verses.shift();
                verses.push(nextIndex);
            } 
            if (nextIndex < 0 || nextIndex >= beats.length) {
                return beats[0];
            } else {
                return selectRandomNextBeat(beats[nextIndex]);
            }
        }
    }

    function selectRandomNextBeat(seed) {
        if (seed.neighbors.length == 0) {
            return seed;
        } else if (shouldRandomBranch()) {
            var next = seed.neighbors.shift();
            seed.neighbors.push(next);
            return next[0];
        } else {
            return seed;
        }
    }

    function shouldRandomBranch() {
        curRandomBranchChance += randomBranchChanceDelta;
        if (curRandomBranchChance > maxRandomBranchChance) {
            curRandomBranchChance = maxRandomBranchChance;
        }
        var shouldBranch = Math.random() < curRandomBranchChance;
        // console.log(curRandomBranchChance, shouldBranch);
        if (shouldBranch) {
            curRandomBranchChance = minRandomBranchChance;
        }
        return shouldBranch;
    }

    function updateStats() {
        var now = new Date().getTime();
        beatDiv.text(totalBeats);
        timeDiv.text(secondsToTime((now - startTime) / 1000.));
    }


    function process() {
        if (curOp) {
            if (nextBeat != null) {
                curBeat = nextBeat;
                nextBeat = null;
            } else {
                curBeat = curOp();
            }

            if (curBeat !== null) {
                player.play(curBeat);
                setTimeout( function () { process(); }, 1000 * curBeat.duration);
                totalBeats += 1;
                updateStats();
            }
        } 
    }

    var startTime = 0;
    var interface = {
        start: function() {
            totalBeats = 0;
            bounceSeed = null;
            curOp = next;
            startTime = new Date().getTime();
            $("#go").text('Make it stop, please!');
            $("#go").attr("class", "redButton");
            info("");
            process();
        },

        stop: function() {
            var delta = new Date().getTime() - startTime;
            $("#go").text('Play');
            $("#go").attr("class", "greenButton");
            curOp = null;
            curBeat = null;
            bounceSeed = null;
            incr = 1;
        },

        isRunning: function() {
            return curOp !== null;
        },

        getIncr: function() {
            return incr;
        },

        getCurBeat : function() {
            return curBeat;
        },

        setIncr: function(inc) {
            incr = inc;
        }, 

        setNextBeat: function(beat) {
            nextBeat = beat;
        },
    }
    return interface;
}

function secondsToTime(secs) {
    secs = Math.floor(secs);
    var hours = Math.floor(secs / 3600);
    secs -= hours * 3600;
    var mins = Math.floor(secs/60);
    secs -= mins * 60;

    if (hours < 10) {
        hours = '0' + hours;
    }
    if (mins < 10) {
        mins = '0' + mins;
    }
    if (secs < 10) {
        secs = '0' + secs;
    }
    return hours + ":" + mins + ":" + secs
}

//window.onload = init;

