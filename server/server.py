import os 
import cherrypy
import ConfigParser
import urllib2
import urllib
import simplejson as json
import webtools
import pprint
import time

import markup

class TrackServer(object):
    def __init__(self, config):
        self.production_mode = config.getboolean('settings', 'production')
        self.cache = {}
        self.api_key = "EHY4JJEGIOFA1RCJP"

    def info(self, trid="", callback=None, _=""):
        if callback:
            cherrypy.response.headers['Content-Type']= 'text/javascript'
        else:
            cherrypy.response.headers['Content-Type']= 'application/json'

        if trid in self.cache:
            results = self.cache[trid]
        else:
            results = self.load_track(trid)
            self.cache[trid] = results

        return to_json(results, callback)
    info.exposed = True

    def search(self, artist="", title="", callback=None, _=""):
        if callback:
            cherrypy.response.headers['Content-Type']= 'text/javascript'
        else:
            cherrypy.response.headers['Content-Type']= 'application/json'

        key = artist + '-' + title
        if key in self.cache:
            results = self.cache[key]
        else:
            results = self.search_track(artist, title)
            self.cache[key] = results
        return to_json(results, callback)
    search.exposed = True

    def load_track(self, trid, _=""):
        url = "http://developer.echonest.com/api/v4/track/profile?api_key=%s&format=json&id=%s&bucket=audio_summary" % (self.api_key, trid)
        results_json = urllib.urlopen(url).read()
        print results_json
        results = json.loads(results_json)
        response = results['response']
        if 'track' in response:
            info = response['track']
            analysis_json = urllib.urlopen(info['audio_summary']['analysis_url']).read()
            analysis = json.loads(analysis_json)
            track = { 'status' : 'ok', 'info' : info, 'analysis': analysis }
        else:
            track = { 'status' : 'error' }
        return track

    def search_track(self, artist, title):
        url = "http://developer.echonest.com/api/v4/song/search?api_key=%s&&results=1&artist=%s&title=%s&bucket=id:paulify&bucket=tracks&limit=true&bucket=audio_summary" % (self.api_key, artist,title)
        results_json = urllib.urlopen(url).read()
        results = json.loads(results_json)
        songs = results['response']['songs']
        if len(songs) > 0:
            song = songs[0]
            track = song['tracks'][0]
            results = { 'status': 'ok', 'id' : track['id'], 'title': song['title'], 
                    'artist': song['artist_name'], 'audio': track['audio'] }
        else:
            results = { 'status' : "not found" }
        return results

def to_json(dict, callback=None):
    results =  json.dumps(dict, sort_keys=True, indent = 4) 
    if callback:
        results = callback + "(" + results + ")"
    return results

if __name__ == '__main__':
    urllib2.install_opener(urllib2.build_opener())
    conf_path = os.path.abspath('web.conf')
    print 'reading config from', conf_path
    cherrypy.config.update(conf_path)

    config = ConfigParser.ConfigParser()
    config.read(conf_path)
    production_mode = config.getboolean('settings', 'production')

    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Set up site-wide config first so we get a log if errors occur.

    if production_mode:
        print "Starting in production mode"
        cherrypy.config.update({'environment': 'production',
                                'log.error_file': 'simdemo.log',
                                'log.screen': True})
    else:
        print "Starting in development mode"
        cherrypy.config.update({'noenvironment': 'production',
                                'log.error_file': 'site.log',
                                'log.screen': True})

    conf = webtools.get_export_map_for_directory("static")
    cherrypy.quickstart(TrackServer(config), '/TrackServer', config=conf)

