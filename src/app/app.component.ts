import { Component } from '@angular/core';
import { Platform } from 'ionic-angular';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';

import { HomePage } from '../pages/home/home';
import {GeneralService} from "../services/GeneralService";
@Component({
  templateUrl: 'app.html'
})
export class MyApp {
  rootPage:any = HomePage;


  constructor(platform: Platform, statusBar: StatusBar, splashScreen: SplashScreen, public mservice:GeneralService) {
    platform.ready().then(() => {
      // Okay, so the platform is ready and our plugins are available.
      // Here you can do any higher level native things you might need.
      statusBar.styleDefault();
      splashScreen.hide();
      window['angularComponentRef'] = {
        getYandex: (value) => this.callFromOutside(value),
        component: this
      };
      console.log('reference added');
    });
  }

  callFromOutside(map){
    console.log('Got Yandex API');
    this.mservice.map = map;
  }
}

