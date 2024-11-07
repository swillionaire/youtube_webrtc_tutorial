import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatGridList, MatGridTile } from '@angular/material/grid-list';

import { environment } from '../../environments/environment';
import { DataService } from './service/data.service';
import { Message } from './types/message';

const mediaConstraints = {
  audio: true,
  video: true,
};

const offerOptions = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true,
};

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [MatGridList, MatGridTile, MatButton],
  providers: [DataService],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent implements AfterViewInit {
  @ViewChild('local_video') localVideo!: ElementRef;
  @ViewChild('received_video') remoteVideo!: ElementRef;

  private peerConnection!: RTCPeerConnection;

  private localStream!: MediaStream;

  inCall = false;
  localVideoActive = false;

  constructor(private dataService: DataService) {}

  async call(): Promise<void> {
    this.createPeerConnection();

    // Add the tracks from the local stream to the RTCPeerConnection
    this.localStream.getTracks().forEach((track: MediaStreamTrack) => this.peerConnection.addTrack(track, this.localStream));

    try {
      const offer: RTCSessionDescriptionInit = await this.peerConnection.createOffer(offerOptions);
      // Establish the offer as the local peer's current description.
      await this.peerConnection.setLocalDescription(offer);

      this.inCall = true;

      this.dataService.sendMessage({ type: 'offer', data: offer });
    } catch (e: unknown) {
      const error = e as {name:string, message:string};
      this.handleGetUserMediaError(error);
    }
  }

  hangUp(): void {
    this.dataService.sendMessage({ type: 'hangup', data: '' });
    this.closeVideoCall();
  }

  ngAfterViewInit(): void {
    this.addIncominMessageHandler();
    this.requestMediaDevices();
  }

  private addIncominMessageHandler(): void {
    this.dataService.connect();

    // this.transactions$.subscribe();
    this.dataService.messages$.subscribe(
      (msg: Message) => {
        // console.log('Received message: ' + msg.type);
        switch (msg.type) {
          case 'offer':
            this.handleOfferMessage(msg.data as RTCSessionDescriptionInit);
            break;
          case 'answer':
            this.handleAnswerMessage(msg.data as RTCSessionDescriptionInit);
            break;
          case 'hangup':
            this.handleHangupMessage(msg);
            break;
          case 'ice-candidate':
            this.handleICECandidateMessage(msg.data as RTCIceCandidate);
            break;
          default:
            console.log('unknown message of type ' + msg.type);
        }
      },
      (error) => console.log(error),
    );
  }

  /* ########################  MESSAGE HANDLER  ################################## */

  private handleOfferMessage(msg: RTCSessionDescriptionInit): void {
    console.log('handle incoming offer');
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    if (!this.localStream) {
      this.startLocalVideo();
    }

    this.peerConnection
      .setRemoteDescription(new RTCSessionDescription(msg))
      .then(() => {
        // add media stream to local video
        this.localVideo.nativeElement.srcObject = this.localStream;

        // add media tracks to remote connection
        this.localStream.getTracks().forEach((track) => this.peerConnection.addTrack(track, this.localStream));
      })
      .then(() => {
        // Build SDP for answer message
        return this.peerConnection.createAnswer();
      })
      .then((answer: RTCSessionDescriptionInit) => {
        // Set local SDP
        return this.peerConnection.setLocalDescription(answer);
      })
      .then(() => {
        // Send local SDP to remote party
        this.dataService.sendMessage({ type: 'answer', data: this.peerConnection.localDescription });

        this.inCall = true;
      })
      .catch((e: unknown) => {
        const error = e as {name:string, message:string};
        this.handleGetUserMediaError(error);
      });
  }

  private handleAnswerMessage(msg: RTCSessionDescriptionInit): void {
    console.log('handle incoming answer');
    this.peerConnection.setRemoteDescription(msg);
  }

  private handleHangupMessage(msg: Message): void {
    console.log(msg);
    this.closeVideoCall();
  }

  private handleICECandidateMessage(msg: RTCIceCandidate): void {
    const candidate = new RTCIceCandidate(msg);
    this.peerConnection.addIceCandidate(candidate).catch(this.reportError);
  }

  private async requestMediaDevices(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      // pause all tracks
      this.pauseLocalVideo();
    } catch (e: unknown) {
      const error = e as {name:string};
      console.error(error);
      alert(`getUserMedia() error: ${error.name}`);
    }
  }

  startLocalVideo(): void {
    console.log('starting local stream');
    this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
      track.enabled = true;
    });
    this.localVideo.nativeElement.srcObject = this.localStream;

    this.localVideoActive = true;
  }

  pauseLocalVideo(): void {
    console.log('pause local stream');
    this.localStream.getTracks().forEach((track: MediaStreamTrack) => {
      track.enabled = false;
    });
    this.localVideo.nativeElement.srcObject = undefined;

    this.localVideoActive = false;
  }

  private createPeerConnection(): void {
    console.log('creating PeerConnection...');
    this.peerConnection = new RTCPeerConnection(environment.RTCPeerConfiguration);

    this.peerConnection.onicecandidate = this.handleICECandidateEvent;
    this.peerConnection.oniceconnectionstatechange = this.handleICEConnectionStateChangeEvent;
    this.peerConnection.onsignalingstatechange = this.handleSignalingStateChangeEvent;
    this.peerConnection.ontrack = this.handleTrackEvent;
  }

  private closeVideoCall(): void {
    console.log('Closing call');

    if (this.peerConnection) {
      console.log('--> Closing the peer connection');

      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onsignalingstatechange = null;

      // Stop all transceivers on the connection
      this.peerConnection.getTransceivers().forEach((transceiver: RTCRtpTransceiver) => {
        transceiver.stop();
      });

      // Close the peer connection
      this.peerConnection.close();

      this.inCall = false;
    }
  }

  /* ########################  ERROR HANDLER  ################################## */
  private handleGetUserMediaError = (error: {name:string, message:string}): void => {
    switch (error.name) {
      case 'NotFoundError':
        alert('Unable to open your call because no camera and/or microphone were found.');
        break;
      case 'SecurityError':
      case 'PermissionDeniedError':
        // Do nothing; this is the same as the user canceling the call.
        break;
      default:
        console.log(error);
        alert('Error opening your camera and/or microphone: ' + error.message);
        break;
    }

    this.closeVideoCall();
  }

  private reportError = (e: Error) => {
    console.log('got Error: ' + e.name);
    console.log(e);
  }

  /* ########################  EVENT HANDLER  ################################## */
  private handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
    console.log(event);
    if (event.candidate) {
      this.dataService.sendMessage({
        type: 'ice-candidate',
        data: event.candidate,
      });
    }
  };

  private handleICEConnectionStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        this.closeVideoCall();
        break;
    }
  };

  private handleSignalingStateChangeEvent = (event: Event) => {
    console.log(event);
    switch (this.peerConnection.signalingState) {
      case 'closed':
        this.closeVideoCall();
        break;
    }
  };

  private handleTrackEvent = (event: RTCTrackEvent) => {
    console.log(event);
    this.remoteVideo.nativeElement.srcObject = event.streams[0];
  };
}
